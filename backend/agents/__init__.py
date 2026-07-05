"""
Boardroom AI — Agent Pipeline Runner
=======================================
Uses the agent factory to dynamically build and run board meetings.
Streams chunks (text + thinking) to the frontend via SSE.

Architecture:
  SequentialAgent(
    ParallelAgent(6 template-specific specialists) →
    ModeratorAgent
  )
"""

import json
import re
import logging
from typing import Any, Dict

# Monkeypatch ADK LLMRegistry to support gemma-4 models using Gemini client
import google.adk.models.registry as r
from google.adk.models.google_llm import Gemini
r.LLMRegistry._register(r'gemma-4.*', Gemini)

from google.adk.runners import InMemoryRunner
from google.genai import types

from agents.agent_factory import build_board
from agents.board_config import get_board_config
from templates.board_templates import TemplateType

logger = logging.getLogger("boardroom_ai.agents")


# ---------------------------------------------------------------------------
# Thinking tag parser
# ---------------------------------------------------------------------------
class AgentStreamParser:
    def __init__(self):
        self.is_thinking = False
        self.buffer = ""

    def process_chunk(self, chunk: str):
        self.buffer += chunk
        
        while self.buffer:
            if not self.is_thinking:
                idx = self.buffer.find("<THINKING>")
                if idx != -1:
                    before = self.buffer[:idx]
                    if before:
                        yield (False, before)
                    self.is_thinking = True
                    self.buffer = self.buffer[idx + len("<THINKING>"):]
                else:
                    matched_partial = False
                    for i in range(1, len("<THINKING>")):
                        if self.buffer.endswith("<THINKING>"[:i]):
                            before = self.buffer[:-i]
                            if before:
                                yield (False, before)
                            self.buffer = self.buffer[-i:]
                            matched_partial = True
                            break
                    if not matched_partial:
                        yield (False, self.buffer)
                        self.buffer = ""
                        
            else:
                idx = self.buffer.find("</THINKING>")
                if idx != -1:
                    before = self.buffer[:idx]
                    if before:
                        yield (True, before)
                    self.is_thinking = False
                    self.buffer = self.buffer[idx + len("</THINKING>"):]
                else:
                    matched_partial = False
                    for i in range(1, len("</THINKING>")):
                        if self.buffer.endswith("</THINKING>"[:i]):
                            before = self.buffer[:-i]
                            if before:
                                yield (True, before)
                            self.buffer = self.buffer[-i:]
                            matched_partial = True
                            break
                    if not matched_partial:
                        yield (True, self.buffer)
                        self.buffer = ""


# ---------------------------------------------------------------------------
# Meeting runner
# ---------------------------------------------------------------------------
async def run_meeting(
    meeting_id: str,
    template_type: TemplateType,
    fields: Dict[str, Any],
):
    """
    Run a full board meeting as an async generator yielding JSON strings for SSE.
    
    Yields event types:
      - {"type": "roles", "data": [...]}     — board role info for frontend
      - {"type": "thinking", "agent": "...", "text": "..."}  — thinking content
      - {"type": "chunk", "agent": "...", "text": "..."}     — analysis content
      - {"type": "report", "data": {...}}    — final structured report
      - {"type": "error", "message": "..."}  — error message
    """
    template_key = template_type.value
    prompt = fields.get("prompt", "")

    # Get the board config to send role info to frontend
    config = get_board_config(template_key)
    roles_info = [
        {
            "key": role["key"],
            "name": role["name"],
            "title": role["title"],
            "icon": role["icon"],
            "color": role["color"],
        }
        for role in config["roles"]
    ]
    # Add moderator
    mod = config["moderator"]
    roles_info.append({
        "key": mod["key"],
        "name": mod["name"],
        "title": mod["title"],
        "icon": mod["icon"],
        "color": mod["color"],
    })

    # Send role definitions to frontend first
    yield json.dumps({"type": "roles", "data": roles_info})

    # Build the user message
    user_message = f"""## Board Meeting Analysis Request

**Template**: {config['name']}
**Meeting ID**: {meeting_id}

**User's Question / Decision**:
{prompt}

---

Analyze this thoroughly from your specific expertise. Show your thinking process, then provide a clear analysis with a VOTE and CONFIDENCE score.
"""

    # Build the board pipeline dynamically from template
    pipeline = build_board(template_key)

    # Set up runner
    runner = InMemoryRunner(agent=pipeline)
    runner.auto_create_session = True

    logger.info(f"Running {config['name']} for meeting {meeting_id}...")

    final_text = ""
    parsers = {}
    try:
        async for event in runner.run_async(
            user_id=f"meeting_{meeting_id}",
            session_id=meeting_id,
            new_message=types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_message)],
            ),
        ):
            author = getattr(event, "author", None)
            if not author:
                continue

            if hasattr(event, "content") and event.content and event.content.parts:
                for part in event.content.parts:
                    if hasattr(part, "text") and part.text:
                        raw_text = part.text

                        # Map agent name → role key for frontend
                        agent_key = _agent_name_to_key(author, config)

                        # Parse thinking vs regular content
                        if author not in parsers:
                            parsers[author] = AgentStreamParser()
                            
                        segments = parsers[author].process_chunk(raw_text)

                        for is_thinking, content in segments:
                            if is_thinking:
                                yield json.dumps({
                                    "type": "thinking",
                                    "agent": agent_key,
                                    "text": content,
                                })
                            else:
                                yield json.dumps({
                                    "type": "chunk",
                                    "agent": agent_key,
                                    "text": content,
                                })

                        # Track moderator output for report parsing
                        if author == config["moderator"]["name"]:
                            final_text += raw_text

        logger.info(f"Pipeline completed for meeting {meeting_id}")

        # Parse the Moderator's output into structured report
        report = _parse_moderator_output(
            final_text, meeting_id, template_type,
            fields.get("decision_title", "Chat Session"),
            config
        )

        yield json.dumps({"type": "report", "data": report})

    except Exception as e:
        logger.error(f"Error during board meeting: {e}")
        yield json.dumps({
            "type": "error",
            "message": f"Board meeting error: {str(e)}"
        })


def _agent_name_to_key(agent_name: str, config: dict) -> str:
    """Map an ADK agent name (e.g. 'CEOAgent') to its display key (e.g. 'CEO')."""
    for role in config["roles"]:
        if role["name"] == agent_name:
            return role["key"]
    if config["moderator"]["name"] == agent_name:
        return config["moderator"]["key"]
    return agent_name


# ---------------------------------------------------------------------------
# Output parser
# ---------------------------------------------------------------------------
def _parse_moderator_output(
    raw_output: str,
    meeting_id: str,
    template_type: TemplateType,
    decision_title: str,
    config: dict,
) -> Dict[str, Any]:
    """Parse the Moderator's raw output into a structured report dict."""
    # Build default votes from template roles
    default_votes = {}
    for role in config["roles"]:
        default_votes[role["key"]] = {"vote": "DEFER", "confidence": 50}

    default_report = {
        "meeting_id": meeting_id,
        "template": template_type.value,
        "decision_title": decision_title,
        "final_decision": "DEFER",
        "confidence_score": 50,
        "board_votes": default_votes,
        "key_risks": ["Unable to complete full risk analysis."],
        "recommended_actions": ["Retry the board meeting with more context."],
        "debate_summary": "The board meeting encountered an issue during synthesis.",
    }

    if not raw_output or not raw_output.strip():
        logger.warning("Empty moderator output, using default report")
        return default_report

    try:
        json_str = raw_output.strip()

        # Remove markdown fences if present
        if json_str.startswith("```"):
            json_str = re.sub(r"^```(?:json)?\s*\n?", "", json_str)
            json_str = re.sub(r"\n?```\s*$", "", json_str)

        # Try to find JSON object in the text
        json_match = re.search(r"\{[\s\S]*\}", json_str)
        if json_match:
            json_str = json_match.group()

        report = json.loads(json_str)
        report["meeting_id"] = meeting_id
        report["template"] = template_type.value
        report["decision_title"] = decision_title

        # Ensure all required keys exist
        for key in default_report:
            if key not in report:
                report[key] = default_report[key]

        return report

    except (json.JSONDecodeError, ValueError) as e:
        logger.warning(f"Failed to parse moderator JSON: {e}")
        default_report["debate_summary"] = raw_output[:1000]
        return default_report
