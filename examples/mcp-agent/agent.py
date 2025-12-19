"""
Sample agent using mcp-use to connect to skills-kit MCP server.

This example demonstrates how to use skills created with skills-kit
via the MCP protocol using the mcp-use library.

Usage:
    1. Start the skills-kit MCP server:
       skills-kit serve ./my-skill --port 3000

    2. Run this agent:
       python agent.py "Your prompt here"
       python agent.py --file data.json "Process this file"
       python agent.py  # Interactive mode
"""

import asyncio
import base64
import json
import mimetypes
import os
from pathlib import Path
from dotenv import load_dotenv

from mcp_use import MCPAgent, MCPClient
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage

load_dotenv()

# Store attached files for the session
attached_files: list[dict] = []
auto_pass_used: set[str] = set()


def load_file(file_path: str) -> dict:
    """Load a file and return its metadata and base64 content."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    with open(path, "rb") as f:
        content = f.read()

    return {
        "filename": path.name,
        "mime_type": mime_type,
        "data": base64.b64encode(content).decode("utf-8"),
        "size": len(content),
        "path": str(path.absolute())
    }


def format_file_for_prompt(file_info: dict) -> str:
    """Format file info for inclusion in prompt."""
    # For text files, include content directly
    if file_info["mime_type"].startswith("text/") or file_info["mime_type"] == "application/json":
        try:
            content = base64.b64decode(file_info["data"]).decode("utf-8")
            return f"\n--- File: {file_info['filename']} ---\n{content}\n--- End of {file_info['filename']} ---\n"
        except:
            pass

    # For binary files, include metadata
    return f"\n[Attached file: {file_info['filename']} ({file_info['mime_type']}, {file_info['size']} bytes)]\n"


def build_prompt_with_files(prompt: str, files: list[dict]) -> str:
    """Build a prompt that includes file contents/references."""
    if not files:
        return prompt

    file_context = "\n".join(format_file_for_prompt(f) for f in files)
    return f"{file_context}\n{prompt}"


def extract_json_payload(files: list[dict], used_filenames: set[str] | None = None) -> tuple[object, str] | None:
    """Return parsed JSON content and filename from the first suitable attachment."""
    if not files:
        return None
    for file_info in files:
        filename = file_info.get("filename", "")
        if used_filenames and filename in used_filenames:
            continue
        is_json = file_info.get("mime_type") == "application/json" or filename.endswith(".json")
        if not is_json:
            continue
        try:
            raw = base64.b64decode(file_info["data"]).decode("utf-8")
            return json.loads(raw), filename
        except Exception:
            continue
    return None


def payload_matches_schema(schema: dict, payload: object) -> bool:
    """Best-effort check that payload matches the tool's input schema type."""
    expected_type = schema.get("type")
    if expected_type == "object":
        return isinstance(payload, dict)
    if expected_type == "array":
        return isinstance(payload, list)
    return True


def format_tool_result(result) -> str:
    """Format an MCP CallToolResult into a printable string."""
    text_parts: list[str] = []
    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        try:
            text_parts.append(json.dumps(structured, indent=2))
        except Exception:
            text_parts.append(str(structured))
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if text:
            text_parts.append(text)
    output = "\n".join(text_parts).strip()
    if output:
        return output
    return str(result)


async def maybe_auto_call_tool(
    client: MCPClient,
    files: list[dict],
    used_filenames: set[str] | None = None,
) -> str | None:
    """If exactly one tool exists and a JSON attachment is present, call the tool directly."""
    payload_info = extract_json_payload(files, used_filenames)
    if not payload_info:
        return None
    payload, filename = payload_info

    sessions = client.get_all_active_sessions()
    if not sessions:
        sessions = await client.create_all_sessions()

    tools: list[tuple[str, object, object]] = []
    for server_name, session in sessions.items():
        try:
            session_tools = await session.list_tools()
        except Exception:
            continue
        for tool in session_tools:
            tools.append((server_name, session, tool))

    if len(tools) != 1:
        return None

    server_name, session, tool = tools[0]
    input_schema = getattr(tool, "inputSchema", {}) or {}
    if not payload_matches_schema(input_schema, payload):
        return None

    result = await session.call_tool(tool.name, payload)
    print(f"\nAuto: called {server_name}.{tool.name} with {filename}")
    if used_filenames is not None:
        used_filenames.add(filename)
    return format_tool_result(result)


def get_llm(provider: str = "anthropic"):
    """Get LLM instance based on provider."""
    if provider == "openai":
        return ChatOpenAI(
            model=os.getenv("OPENAI_MODEL", "gpt-4o"),
            api_key=os.getenv("OPENAI_API_KEY")
        )
    else:
        return ChatAnthropic(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )


async def run_agent(prompt: str, provider: str = "anthropic", files: list[dict] = None):
    """Run the MCP agent with the given prompt and optional files."""

    # Configure MCP server connection
    # Use base URL - mcp-use auto-detects Streamable HTTP vs SSE transport
    config = {
        "mcpServers": {
            "skills": {
                "url": os.getenv("MCP_SERVER_URL", "http://localhost:3000/mcp")
            }
        }
    }

    # Create MCP client
    client = MCPClient.from_dict(config)

    try:
        auto_result = await maybe_auto_call_tool(client, files or [])
        if auto_result is not None:
            return auto_result

        # Create LLM only if we didn't auto-call a tool
        llm = get_llm(provider)

        # Create agent
        agent = MCPAgent(
            llm=llm,
            client=client,
            use_server_manager=False,
            max_iterations=10
        )

        # Build prompt with file context
        full_prompt = build_prompt_with_files(prompt, files or [])

        result = await agent.run(full_prompt)
        return result
    finally:
        try:
            await client.disconnect_all()
        except Exception:
            pass


async def interactive_mode(provider: str = "anthropic", skill_path: str = None):
    """Run agent in interactive mode."""
    global attached_files

    print("Skills-Kit MCP Agent (Interactive Mode)")
    print("=" * 40)
    print(f"Provider: {provider}")
    print("\nCommands:")
    print("  /attach <file>  - Attach a file to the conversation")
    print("  /files          - List attached files")
    print("  /clear          - Clear attached files")
    print("  /help           - Show this help")
    print("  quit/exit       - Exit the agent")
    print()

    # Configure MCP server - use stdio transport for better compatibility
    if skill_path:
        # Resolve to absolute path to avoid path traversal issues
        abs_skill_path = os.path.abspath(skill_path)
        cli_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../packages/cli/dist/index.js"))
        config = {
            "mcpServers": {
                "skills": {
                    "command": "node",
                    "args": [
                        cli_path,
                        "serve",
                        abs_skill_path,
                        "--transport", "stdio",
                        "--install-deps"
                    ]
                }
            }
        }
    else:
        # Connect to MCP server via Streamable HTTP
        config = {
            "mcpServers": {
                "skills": {
                    "url": os.getenv("MCP_SERVER_URL", "http://localhost:3000/mcp")
                }
            }
        }

    client = MCPClient.from_dict(config)
    llm = get_llm(provider)
    agent = MCPAgent(llm=llm, client=client, use_server_manager=False)

    try:
        while True:
            try:
                user_input = input("\nYou: ").strip()

                if not user_input:
                    continue

                # Handle commands
                if user_input.lower() in ["quit", "exit"]:
                    print("Goodbye!")
                    break

                if user_input.startswith("/attach "):
                    file_path = user_input[8:].strip()
                    try:
                        file_info = load_file(file_path)
                        attached_files.append(file_info)
                        print(f"Attached: {file_info['filename']} ({file_info['mime_type']}, {file_info['size']} bytes)")
                    except Exception as e:
                        print(f"Error: {e}")
                    continue

                if user_input == "/files":
                    if attached_files:
                        print("Attached files:")
                        for i, f in enumerate(attached_files, 1):
                            print(f"  {i}. {f['filename']} ({f['mime_type']}, {f['size']} bytes)")
                    else:
                        print("No files attached")
                    continue

                if user_input == "/clear":
                    attached_files = []
                    print("Cleared all attached files")
                    continue

                if user_input == "/help":
                    print("\nCommands:")
                    print("  /attach <file>  - Attach a file to the conversation")
                    print("  /files          - List attached files")
                    print("  /clear          - Clear attached files")
                    print("  /help           - Show this help")
                    print("  quit/exit       - Exit the agent")
                    continue

                # Build prompt with attached files
                auto_result = await maybe_auto_call_tool(client, attached_files, auto_pass_used)
                if auto_result is not None:
                    print(auto_result)
                    continue

                full_prompt = build_prompt_with_files(user_input, attached_files)

                print("\nAgent: ", end="", flush=True)
                result = await agent.run(full_prompt)
                print(result)

            except KeyboardInterrupt:
                print("\nGoodbye!")
                break
    finally:
        # Cleanup - MCPClient uses disconnect_all()
        try:
            await client.disconnect_all()
        except Exception:
            pass


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="MCP Agent for skills-kit skills"
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        help="Prompt to send to the agent (omit for interactive mode)"
    )
    parser.add_argument(
        "--provider",
        choices=["anthropic", "openai"],
        default="anthropic",
        help="LLM provider to use (default: anthropic)"
    )
    parser.add_argument(
        "--server-url",
        default="http://localhost:3000/mcp",
        help="MCP server URL (default: http://localhost:3000/mcp)"
    )
    parser.add_argument(
        "--file", "-f",
        action="append",
        dest="files",
        help="File to attach (can be used multiple times)"
    )
    parser.add_argument(
        "--skill", "-s",
        dest="skill_path",
        help="Path to skill directory (uses stdio transport, no separate server needed)"
    )

    args = parser.parse_args()

    # Set server URL in environment
    os.environ["MCP_SERVER_URL"] = args.server_url

    # Load files if specified
    files = []
    if args.files:
        for file_path in args.files:
            try:
                file_info = load_file(file_path)
                files.append(file_info)
                print(f"Loaded: {file_info['filename']} ({file_info['size']} bytes)")
            except Exception as e:
                print(f"Error loading {file_path}: {e}")
                return

    if args.prompt:
        # Single prompt mode
        result = asyncio.run(run_agent(args.prompt, args.provider, files))
        print(result)
    else:
        # Interactive mode (preload files if any)
        global attached_files
        attached_files = files
        asyncio.run(interactive_mode(args.provider, args.skill_path))


if __name__ == "__main__":
    main()
