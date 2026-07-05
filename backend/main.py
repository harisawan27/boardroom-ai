"""
Boardroom AI — FastAPI Application
===================================
Main entry point for the Boardroom AI backend. Provides:
- POST /meeting: Submit a decision for board analysis
- GET /health: Health check endpoint

All API keys are loaded from environment variables via .env file.
"""

import os
import uuid
import logging
import json
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, EmailStr
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from fastapi import FastAPI, Request, Depends, HTTPException, status

from security.middleware import (
    setup_rate_limiting,
    sanitize_meeting_input,
    SecurityHeadersMiddleware,
)
from templates.board_templates import (
    TemplateType,
    validate_fields,
    TEMPLATE_METADATA,
)
from agents import run_meeting
from database import get_db
from models.user import User
from models.meeting import Meeting
from security.auth import get_password_hash, verify_password, create_access_token, get_current_user
import datetime

# ---------------------------------------------------------------------------
# Load environment variables from .env (never hardcode API keys)
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("boardroom_ai")


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown tasks."""
    logger.info("🏛️  Boardroom AI backend starting up...")
    yield
    logger.info("🏛️  Boardroom AI backend shutting down...")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Boardroom AI",
    description="Multi-agent executive decision engine powered by Google ADK & Gemini",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Security: HTTP headers middleware
# ---------------------------------------------------------------------------
app.add_middleware(SecurityHeadersMiddleware)

# ---------------------------------------------------------------------------
# CORS configuration — origins loaded from env var
# ---------------------------------------------------------------------------
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in allowed_origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Rate limiting (5 requests/min per IP on /meeting)
# ---------------------------------------------------------------------------
limiter = setup_rate_limiting(app)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------
from sse_starlette.sse import EventSourceResponse

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    bio: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class ChatRequest(BaseModel):
    """Input schema for a streaming chat request."""
    template: str = Field(default="STARTUP_BOARD", description="Board template context")
    prompt: str = Field(..., description="The user's raw decision prompt")

class MeetingResponse(BaseModel):
    id: str
    template: str
    prompt: str
    report_data: Optional[Dict[str, Any]]
    created_at: datetime.datetime

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Health check endpoint — returns status ok."""
    return HealthResponse(status="ok")

@app.post("/auth/register", tags=["Auth"])
async def register_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user exists
    result = await db.execute(select(User).filter(User.email == user.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user.password)
    db_user = User(email=user.email, hashed_password=hashed_pwd)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    # Return JWT token
    access_token = create_access_token(data={"sub": db_user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/login", response_model=Token, tags=["Auth"])
async def login(user: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.email == user.email))
    db_user = result.scalars().first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": db_user.id})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/auth/me", tags=["Auth"])
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "email": current_user.email,
        "profile_data": current_user.profile_data
    }

@app.put("/auth/profile", tags=["Auth"])
async def update_profile(profile: ProfileUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    profile_dict = profile.model_dump(exclude_none=True)
    if current_user.profile_data:
        current_user.profile_data = {**current_user.profile_data, **profile_dict}
    else:
        current_user.profile_data = profile_dict
    
    # SQLAlchemy JSONB needs to know it mutated if we just update dict keys,
    # but reassigning the dict works. However, setting the attribute triggers it.
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(current_user, "profile_data")
    
    await db.commit()
    return {"status": "success", "profile_data": current_user.profile_data}

@app.get("/meetings", response_model=List[MeetingResponse], tags=["Meetings"])
async def get_meetings(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Meeting)
        .filter(Meeting.user_id == current_user.id)
        .order_by(Meeting.created_at.desc())
    )
    return result.scalars().all()


@app.post("/chat/stream", tags=["Chat"])
@limiter.limit(os.getenv("RATE_LIMIT", "5/minute"))
async def chat_stream(
    request: Request, 
    body: ChatRequest, 
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Submit a prompt for board analysis and stream the responses.
    """
    try:
        template_type = TemplateType(body.template)
    except ValueError:
        template_type = TemplateType.STARTUP_BOARD

    # Generate meeting ID and Save to DB
    meeting_id = str(uuid.uuid4())
    logger.info(f"Starting chat stream {meeting_id} | template={template_type.value} | user={current_user.email}")
    
    new_meeting = Meeting(
        id=meeting_id,
        user_id=current_user.id,
        template=template_type.value,
        prompt=body.prompt
    )
    db.add(new_meeting)
    await db.commit()

    # Prepare Context Prompt
    # Inject user's profile data if available
    final_prompt = body.prompt
    if current_user.profile_data:
        profile_context = "User Context:\n"
        for k, v in current_user.profile_data.items():
            if v:
                profile_context += f"- {k.capitalize()}: {v}\n"
        final_prompt = f"{profile_context}\nTask:\n{body.prompt}"

    async def event_generator():
        try:
            # We pass a callback to run_meeting or we update the DB after it yields all events.
            # However, run_meeting yields string events. We can capture the final report event.
            final_report_data = None
            async for chunk in run_meeting(meeting_id, template_type, {"prompt": final_prompt, "decision_title": "Chat Session"}):
                yield {"data": chunk}
                try:
                    data = json.loads(chunk)
                    if data.get("type") == "report":
                        final_report_data = data.get("data")
                except:
                    pass
            
            # After stream completes, save the report_data to DB
            if final_report_data:
                # Need a new DB session since the previous one might be tied to the request which could be closed,
                # but actually EventSourceResponse runs in the same context if we are careful, or we use the injected db.
                new_meeting.report_data = final_report_data
                await db.commit()
                
        except Exception as e:
            logger.error(f"Stream error: {e}", exc_info=True)
            yield {"data": json.dumps({"type": "error", "message": str(e)})}

    return EventSourceResponse(event_generator())


# ---------------------------------------------------------------------------
# Run with: uvicorn main:app --reload --port 8000
# ---------------------------------------------------------------------------
