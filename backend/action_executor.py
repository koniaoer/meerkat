import asyncio
import subprocess
import json
import os
from typing import Dict, Any, Optional
from enum import Enum

import httpx

from logger import logger


class ActionType(str, Enum):
    SHELL = "shell"          # Execute shell command
    HTTP = "http"            # Send HTTP request
    WEBHOOK = "webhook"      # Call a webhook
    SCRIPT = "script"        # Run a predefined script


class ActionRisk(str, Enum):
    LOW = "low"              # Safe: read-only, check status
    MEDIUM = "medium"        # Moderate: restart service, scale up
    HIGH = "high"            # Dangerous: delete data, modify config


class ActionStatus(str, Enum):
    PENDING = "pending"      # Waiting for approval
    APPROVED = "approved"    # User approved, waiting to execute
    EXECUTING = "executing"  # Currently running
    COMPLETED = "completed"  # Successfully executed
    FAILED = "failed"        # Execution failed
    REJECTED = "rejected"    # User rejected
    TIMEOUT = "timeout"      # Execution timed out


# Auto-approve settings from environment
AUTO_APPROVE_LOW_RISK = os.environ.get("AUTO_APPROVE_LOW_RISK", "true").lower() == "true"
ACTION_TIMEOUT_SECONDS = int(os.environ.get("ACTION_TIMEOUT_SECONDS", "30"))


async def execute_action(action_type: str, action_config: dict, timeout: int = ACTION_TIMEOUT_SECONDS) -> Dict[str, Any]:
    """Execute an action and return the result"""
    try:
        if action_type == ActionType.SHELL:
            return await _execute_shell(action_config, timeout)
        elif action_type == ActionType.HTTP:
            return await _execute_http(action_config, timeout)
        elif action_type == ActionType.WEBHOOK:
            return await _execute_webhook(action_config, timeout)
        elif action_type == ActionType.SCRIPT:
            return await _execute_script(action_config, timeout)
        else:
            return {"success": False, "output": f"Unknown action type: {action_type}"}
    except asyncio.TimeoutError:
        return {"success": False, "output": f"Action timed out after {timeout}s"}
    except Exception as e:
        return {"success": False, "output": str(e)}


async def _execute_shell(config: dict, timeout: int) -> Dict[str, Any]:
    """Execute a shell command"""
    command = config.get("command", "")
    if not command:
        return {"success": False, "output": "No command specified"}

    # Security: block dangerous commands
    blocked = ["rm -rf /", "mkfs", "dd if=", ":(){ :|:& };:", "> /dev/sda"]
    for b in blocked:
        if b in command:
            return {"success": False, "output": f"Blocked dangerous command pattern: {b}"}

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        output = stdout.decode(errors='replace')
        error = stderr.decode(errors='replace')

        return {
            "success": proc.returncode == 0,
            "output": output or error,
            "return_code": proc.returncode,
        }
    except asyncio.TimeoutError:
        proc.kill()
        raise
    except Exception as e:
        return {"success": False, "output": str(e)}


async def _execute_http(config: dict, timeout: int) -> Dict[str, Any]:
    """Send an HTTP request"""
    url = config.get("url", "")
    method = config.get("method", "POST").upper()
    headers = config.get("headers", {})
    body = config.get("body", {})

    if not url:
        return {"success": False, "output": "No URL specified"}

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            if method == "GET":
                resp = await client.get(url, headers=headers, params=body)
            elif method == "POST":
                resp = await client.post(url, headers=headers, json=body)
            elif method == "PUT":
                resp = await client.put(url, headers=headers, json=body)
            elif method == "DELETE":
                resp = await client.delete(url, headers=headers)
            else:
                return {"success": False, "output": f"Unsupported HTTP method: {method}"}

            return {
                "success": resp.status_code < 400,
                "output": f"HTTP {resp.status_code}: {resp.text[:500]}",
                "status_code": resp.status_code,
            }
        except Exception as e:
            return {"success": False, "output": str(e)}


async def _execute_webhook(config: dict, timeout: int) -> Dict[str, Any]:
    """Call a webhook URL"""
    url = config.get("url", "")
    payload = config.get("payload", {})
    headers = config.get("headers", {"Content-Type": "application/json"})

    if not url:
        return {"success": False, "output": "No webhook URL specified"}

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            resp = await client.post(url, json=payload, headers=headers)
            return {
                "success": resp.status_code < 400,
                "output": f"HTTP {resp.status_code}: {resp.text[:500]}",
                "status_code": resp.status_code,
            }
        except Exception as e:
            return {"success": False, "output": str(e)}


async def _execute_script(config: dict, timeout: int) -> Dict[str, Any]:
    """Run a predefined script by name"""
    script_name = config.get("name", "")
    args = config.get("args", [])

    if not script_name:
        return {"success": False, "output": "No script name specified"}

    # Scripts are stored in /app/scripts/ directory
    script_dir = os.environ.get("SCRIPT_DIR", "/app/scripts")
    script_path = os.path.join(script_dir, script_name)

    if not os.path.exists(script_path):
        return {"success": False, "output": f"Script not found: {script_name}"}

    cmd = [script_path] + [str(a) for a in args]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return {
            "success": proc.returncode == 0,
            "output": stdout.decode(errors='replace') or stderr.decode(errors='replace'),
            "return_code": proc.returncode,
        }
    except asyncio.TimeoutError:
        proc.kill()
        raise
