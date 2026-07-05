import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

# Handle asyncpg sslmode
if "?sslmode=require" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("?sslmode=require", "")

# Create async SQLAlchemy engine
engine = create_async_engine(DATABASE_URL, echo=False, connect_args={"ssl": True})

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    """Dependency to get the database session."""
    async with AsyncSessionLocal() as session:
        yield session
