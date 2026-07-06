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
                # Also handle uppercase just in case Gemma still outputs it
                idx = self.buffer.find("<think>")
                if idx == -1: idx = self.buffer.find("<THINKING>")
                
                if idx != -1:
                    tag_len = 7 if self.buffer[idx:idx+7] == "<think>" else 10
                    before = self.buffer[:idx]
                    if before:
                        yield (False, before)
                    self.is_thinking = True
                    self.buffer = self.buffer[idx + tag_len:]
                else:
                    matched_partial = False
                    for i in range(1, 10):
                        if self.buffer.endswith("<think>"[:i]) or self.buffer.endswith("<THINKING>"[:i]):
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
                idx = self.buffer.find("</think>")
                if idx == -1: idx = self.buffer.find("</THINKING>")
                
                if idx != -1:
                    tag_len = 8 if self.buffer[idx:idx+8] == "</think>" else 11
                    before = self.buffer[:idx]
                    if before:
                        yield (True, before)
                    self.is_thinking = False
                    self.buffer = self.buffer[idx + tag_len:]
                else:
                    matched_partial = False
                    for i in range(1, 11):
                        if self.buffer.endswith("</think>"[:i]) or self.buffer.endswith("</THINKING>"[:i]):
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
    """
    import asyncio
    from google import genai
    import google.genai.types as genai_types
    client = genai.Client()
    
    template_key = template_type.value
    prompt = fields.get("prompt", "")

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
    mod = config["moderator"]
    roles_info.append({
        "key": mod["key"],
        "name": mod["name"],
        "title": mod["title"],
        "icon": mod["icon"],
        "color": mod["color"],
    })

    yield json.dumps({"type": "roles", "data": roles_info})

    user_message = f"""## Board Meeting Analysis Request

**Template**: {config['name']}
**Meeting ID**: {meeting_id}

**User's Question / Decision**:
{prompt}

---

Analyze this thoroughly from your specific expertise. Show your thinking process, then provide a clear analysis with a VOTE and CONFIDENCE score.
"""

    queue = asyncio.Queue()

    async def stream_agent(agent_config, user_msg, q):
        max_retries = 3
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    import random
                    await asyncio.sleep(random.uniform(1.0, 3.0) * attempt)
                    
                contents = [genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=user_msg)])]
                
                async def _run_stream():
                    response_stream = await client.aio.models.generate_content_stream(
                        model=agent_config["model"],
                        contents=contents,
                        config=genai_types.GenerateContentConfig(
                            system_instruction=agent_config["prompt"],
                            temperature=agent_config.get("temperature", 0.7),
                            max_output_tokens=agent_config.get("tokens", 2048)
                        )
                    )
                    
                    parser = AgentStreamParser()
                    full_text = ""
                    
                    async for chunk in response_stream:
                        if chunk.text:
                            full_text += chunk.text
                            for is_thinking, content in parser.process_chunk(chunk.text):
                                await q.put({
                                    "type": "thinking" if is_thinking else "chunk",
                                    "agent": agent_config["key"],
                                    "text": content
                                })
                                
                    if parser.buffer:
                        await q.put({
                            "type": "thinking" if parser.is_thinking else "chunk",
                            "agent": agent_config["key"],
                            "text": parser.buffer
                        })
                    return full_text
                
                # Enforce a strict 45-second timeout on the network call to prevent infinite socket hangs
                full_text = await asyncio.wait_for(_run_stream(), timeout=45.0)
                await q.put({"type": "done", "agent": agent_config["key"], "full_text": full_text})
                return # success
                
            except Exception as e:
                logger.warning(f"Error in {agent_config['key']} (attempt {attempt+1}/{max_retries}): {e}")
                if attempt == max_retries - 1:
                    logger.error(f"Final error in {agent_config['key']}: {e}")
                    err_msg = f"\n\n*[System: Error connecting to model. Failed to generate response after {max_retries} attempts.]*\nError detail: {e}"
                    await q.put({"type": "chunk", "agent": agent_config["key"], "text": err_msg})
                    await q.put({"type": "done", "agent": agent_config["key"], "full_text": err_msg})

    logger.info(f"Running {config['name']} for meeting {meeting_id}...")
    
    completed_specialists = 0
    specialist_texts = {}

    async def orchestrator():
        batch_size = 6
        roles = config["roles"]
        current_context = user_message
        
        for i in range(0, len(roles), batch_size):
            batch = roles[i:i+batch_size]
            
            # Send waiting status for future batches
            if i > 0:
                for role in batch:
                    await queue.put({
                        "type": "status",
                        "agent": role["key"],
                        "status": "waiting",
                        "message": "⏳ Reviewing colleagues' notes..."
                    })
            
            await asyncio.sleep(0.1)
            
            # Update status to thinking for current batch
            for role in batch:
                await queue.put({
                    "type": "status",
                    "agent": role["key"],
                    "status": "thinking",
                    "message": ""
                })

            batch_tasks = [asyncio.create_task(stream_agent(role, current_context, queue)) for role in batch]
            await asyncio.gather(*batch_tasks)
            
            # Build context for next batch using accumulated specialist_texts
            # Note: specialist_texts is populated by the consumer loop below
            if i + batch_size < len(roles):
                current_context += "\n\n### Previous Board Member Analyses:\n"
                for role in batch:
                    # Wait briefly to ensure the consumer loop processed the 'done' event
                    await asyncio.sleep(0.2)
                    current_context += f"**{role['title']}**: {specialist_texts.get(role['key'], 'No analysis provided.')}\n\n"
                current_context += "Please critically review the above analyses and build upon them in your own assessment."

    asyncio.create_task(orchestrator())
    specialist_texts = {}
    
    while completed_specialists < len(config["roles"]):
        event = await queue.get()
        if event["type"] == "done":
            completed_specialists += 1
            specialist_texts[event["agent"]] = event["full_text"]
        else:
            yield json.dumps({
                "type": event["type"],
                "agent": event.get("agent"),
                "text": event.get("text", ""),
                "status": event.get("status"),
                "message": event.get("message")
            })
            
    # Now run Moderator
    moderator_config = config["moderator"]
    moderator_prompt = "Specialist Analyses:\n\n"
    for role in config["roles"]:
        moderator_prompt += f"--- {role['title']} ({role['key']}) ---\n{specialist_texts.get(role['key'], 'No analysis')}\n\n"
        
    moderator_prompt += "\n" + user_message
    
    mod_parser = AgentStreamParser()
    mod_full_text = ""
    
    try:
        mod_stream = await client.aio.models.generate_content_stream(
            model=moderator_config["model"],
            contents=[genai_types.Content(role="user", parts=[genai_types.Part.from_text(text=moderator_prompt)])],
            config=genai_types.GenerateContentConfig(
                system_instruction=moderator_config["prompt"],
                temperature=moderator_config.get("temperature", 0.3),
                max_output_tokens=moderator_config.get("tokens", 2048)
            )
        )
        
        async for chunk in mod_stream:
            if chunk.text:
                mod_full_text += chunk.text
                for is_thinking, content in mod_parser.process_chunk(chunk.text):
                    yield json.dumps({
                        "type": "thinking" if is_thinking else "chunk",
                        "agent": moderator_config["key"],
                        "text": content,
                    })
                    
        if mod_parser.buffer:
            yield json.dumps({
                "type": "thinking" if mod_parser.is_thinking else "chunk",
                "agent": moderator_config["key"],
                "text": mod_parser.buffer
            })
            
    except Exception as e:
        logger.error(f"Error in Moderator: {e}")
        mod_full_text = "{}"

    logger.info(f"Pipeline completed for meeting {meeting_id}")

    # Parse report
    report = _parse_moderator_output(
        mod_full_text, meeting_id, template_type,
        fields.get("decision_title", "Chat Session"),
        config
    )

    yield json.dumps({"type": "report", "data": report})


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
