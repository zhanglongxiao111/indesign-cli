from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .. import __version__


ALLOWED_FIELDS = {
    "ts",
    "session_id",
    "origin_key",
    "cwd_hash",
    "cwd",
    "host",
    "arg_paths",
    "agent_thread_id",
    "agent_run_id",
    "cli_version",
    "registry_hash",
    "event",
    "tool_id",
    "source",
    "ok",
    "error_code",
    "duration_ms",
    "arg_keys",
    "via_batch",
    "code",
    "note",
    "recent_calls",
    "call_id",
    "plugin_version",
    "result_class",
    "failure_stage",
    "error_message",
    "host_action_count",
    "resume_count",
    "plugin_metrics",
    "execution_mode",
}

# result_class 分类：区分门禁正常拒绝、输入问题、环境问题、程序缺陷和超时。
# 未列出的错误码默认归为 runtime_error，宁可保守也不把真缺陷误标成门禁。
_GATE_REJECTION_CODES = {
    "AUTHORING_LINT_FAILED",
    "FIDELITY_GATE_FAILED",
    "REVERSE_AUTHOR_AUDIT_FAILED",
    "OUTPUT_OUTSIDE_PROJECT",
    "PLUGIN_HOST_ACTION_DENIED",
}
_INPUT_ERROR_CODES = {
    "TOOL_NOT_FOUND",
    "MISSING_ARGUMENT",
    "ARGS_REQUIRED",
    "ARGS_UNKNOWN_KEY",
    "ARGS_JSON_INVALID",
    "ARGS_FILE_NOT_FOUND",
    "ARGS_NOT_OBJECT",
    "BAD_TIMEOUT",
    "BAD_TIMESTAMP",
    "SCRIPT_INPUT_REQUIRED",
    "FEEDBACK_CODE_INVALID",
    "FEEDBACK_NOTE_REQUIRED",
    "FEEDBACK_NOTE_TOO_LONG",
    "FEEDBACK_TOOL_INVALID",
    "CLI_PRIMITIVE_ROUTE",
}
_ENVIRONMENT_ERROR_CODES = {
    "INTERNAL_TOOL_START_FAILED",
    "UPDATE_CHECK_FAILED",
    "PLUGIN_RECORD_NOT_FOUND",
    "BACKEND_NOT_SUPPORTED",
    "NODE_SETUP_FAILED",
}


def classify_result(ok: bool, error_code: str | None) -> str:
    if ok:
        return "success"
    code = str(error_code or "")
    if code == "TIMEOUT":
        return "timeout"
    if code in _GATE_REJECTION_CODES:
        return "gate_rejection"
    if code in _INPUT_ERROR_CODES:
        return "input_error"
    if code in _ENVIRONMENT_ERROR_CODES:
        return "environment_error"
    return "runtime_error"

FEEDBACK_CODES = [
    "TOOL_GAP",
    "DOC_UNCLEAR",
    "ERROR_MESSAGE_USELESS",
    "SCHEMA_CONFUSING",
    "UNEXPECTED_BEHAVIOR",
    "PERFORMANCE",
    "MISSING_EXAMPLE",
]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def _parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _hash(value: str, length: int = 16) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()[:length]


def _safe_token(value: str, *, fallback_prefix: str = "id", max_length: int = 96) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip(".-")
    if not cleaned:
        cleaned = f"{fallback_prefix}-{_hash(value)}"
    return cleaned[:max_length]


def _cwd_fingerprint(cwd: Path) -> str:
    try:
        raw = str(cwd.resolve())
    except OSError:
        raw = str(cwd.absolute())
    if os.name == "nt":
        raw = raw.lower()
    return _hash(raw)


def _origin_key(cwd_hash: str) -> str:
    computer = os.environ.get("COMPUTERNAME") or os.environ.get("HOSTNAME") or "unknown-computer"
    user = os.environ.get("USERNAME") or os.environ.get("USER") or "unknown-user"
    return _hash(f"{computer}\0{user}\0{cwd_hash}", 24)


def _idle_hours() -> float:
    raw = os.environ.get("INDESIGN_CLI_TELEMETRY_IDLE_HOURS")
    if not raw:
        return 8.0
    try:
        value = float(raw)
    except ValueError:
        return 8.0
    if value <= 0:
        return 8.0
    return value


def _new_session_id(origin_key: str, now: datetime) -> str:
    stamp = now.strftime("%Y%m%d%H%M%S")
    return f"s-{origin_key[:12]}-{stamp}-{uuid.uuid4().hex[:8]}"


def _state_path(root: Path, origin_key: str) -> Path:
    return root / "state" / f"{origin_key}.json"


def _read_state(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _resolve_session(root: Path, origin_key: str, cwd_hash: str, now: datetime) -> tuple[str, str | None, str | None]:
    explicit = os.environ.get("INDESIGN_CLI_SESSION_ID")
    agent_thread_id = os.environ.get("INDESIGN_CLI_AGENT_THREAD_ID") or None
    agent_run_id = os.environ.get("INDESIGN_CLI_AGENT_RUN_ID") or None
    if explicit:
        return _safe_token(explicit, fallback_prefix="session"), agent_thread_id, agent_run_id
    if agent_thread_id and agent_run_id:
        return f"agent-{_hash(agent_thread_id, 12)}-{_hash(agent_run_id, 12)}", agent_thread_id, agent_run_id

    state = _read_state(_state_path(root, origin_key))
    last_seen = _parse_iso(state.get("last_seen_at"))
    session_id = state.get("session_id")
    if isinstance(session_id, str) and session_id and state.get("cwd_hash") == cwd_hash and last_seen:
        if now - last_seen <= timedelta(hours=_idle_hours()):
            return _safe_token(session_id, fallback_prefix="session"), None, None
    return _new_session_id(origin_key, now), None, None


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.stem}.{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def _telemetry_root() -> Path | None:
    if os.environ.get("INDESIGN_CLI_TELEMETRY", "").lower() == "off":
        return None
    root = os.environ.get("INDESIGN_CLI_TELEMETRY_DIR")
    if not root:
        return None
    return Path(root)


def telemetry_context(*, cwd: Path | None = None, now: datetime | None = None) -> dict[str, Any] | None:
    root = _telemetry_root()
    if root is None:
        return None
    current_cwd = cwd or Path.cwd()
    current_now = now or _utc_now()
    cwd_hash = _cwd_fingerprint(current_cwd)
    origin_key = _origin_key(cwd_hash)
    session_id, agent_thread_id, agent_run_id = _resolve_session(root, origin_key, cwd_hash, current_now)
    context: dict[str, Any] = {
        "root": root,
        "now": current_now,
        "ts": _iso(current_now),
        "session_id": session_id,
        "origin_key": origin_key,
        "cwd_hash": cwd_hash,
        # 内部遥测记录真实工作目录和机器名以便定位问题工位/项目；
        # 公网用户应按 README 用 INDESIGN_CLI_TELEMETRY=off 关闭整个遥测。
        "cwd": str(current_cwd),
        "host": os.environ.get("COMPUTERNAME") or os.environ.get("HOSTNAME") or "",
        "cli_version": __version__,
    }
    if agent_thread_id:
        context["agent_thread_id"] = agent_thread_id
    if agent_run_id:
        context["agent_run_id"] = agent_run_id
    execution_mode = os.environ.get("INDESIGN_CLI_EXECUTION_MODE")
    if execution_mode and execution_mode.strip():
        context["execution_mode"] = _safe_token(execution_mode.strip().lower(), fallback_prefix="mode", max_length=24)
    return context


def _sanitize_event(event: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    payload = {key: value for key, value in event.items() if key in ALLOWED_FIELDS}
    payload.update(
        {
            "ts": context["ts"],
            "session_id": context["session_id"],
            "origin_key": context["origin_key"],
            "cwd_hash": context["cwd_hash"],
            "cwd": context["cwd"],
            "host": context["host"],
            "cli_version": context["cli_version"],
        }
    )
    if "agent_thread_id" in context:
        payload["agent_thread_id"] = context["agent_thread_id"]
    if "agent_run_id" in context:
        payload["agent_run_id"] = context["agent_run_id"]
    if "execution_mode" in context:
        payload["execution_mode"] = context["execution_mode"]
    if "event" not in payload:
        payload["event"] = "tool_call"
    return {key: payload[key] for key in payload if key in ALLOWED_FIELDS}


def record_event(event: dict[str, Any], *, cwd: Path | None = None, now: datetime | None = None) -> dict[str, Any] | None:
    context = telemetry_context(cwd=cwd, now=now)
    if context is None:
        return None
    payload = _sanitize_event(event, context)
    root = context["root"]
    try:
        state_payload = {
            "session_id": payload["session_id"],
            "created_at": payload["ts"],
            "last_seen_at": payload["ts"],
            "cwd_hash": payload["cwd_hash"],
        }
        state_path = _state_path(root, payload["origin_key"])
        previous_state = _read_state(state_path)
        if previous_state.get("session_id") == payload["session_id"] and isinstance(previous_state.get("created_at"), str):
            state_payload["created_at"] = previous_state["created_at"]
        _write_json_atomic(state_path, state_payload)

        date_part = context["now"].astimezone(timezone.utc).date().isoformat()
        session_file = root / "sessions" / date_part / f"{payload['origin_key']}__{payload['session_id']}.jsonl"
        session_file.parent.mkdir(parents=True, exist_ok=True)
        with session_file.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    except Exception:
        pass
    return payload


_PATH_ARG_KEY_RE = re.compile(r"(path|file|dir|folder)s?$", re.IGNORECASE)


def extract_path_args(args: dict[str, Any] | None) -> list[str]:
    """按键名启发式抽取路径类参数值（key 以 path/file/dir/folder 结尾）。

    只取字符串值；内容类参数（contents/text 等）永远不会被抽进遥测。
    """
    if not isinstance(args, dict):
        return []
    values: list[str] = []
    for key in sorted(args):
        value = args[key]
        if isinstance(value, str) and value.strip() and _PATH_ARG_KEY_RE.search(str(key)):
            values.append(value)
    return values


_ERROR_MESSAGE_MAX_LENGTH = 300
_PLUGIN_METRIC_MAX_KEYS = 40


def _sanitize_plugin_metrics(metrics: Any) -> dict[str, Any] | None:
    """只保留标量指标（数量、耗时、阶段名），永远不透传内容类数据。"""
    if not isinstance(metrics, dict):
        return None
    sanitized: dict[str, Any] = {}
    for key in sorted(metrics)[:_PLUGIN_METRIC_MAX_KEYS]:
        value = metrics[key]
        if isinstance(value, bool) or isinstance(value, (int, float)):
            sanitized[str(key)[:64]] = value
        elif isinstance(value, str) and len(value) <= 64:
            sanitized[str(key)[:64]] = value
    return sanitized or None


def record_tool_call(
    *,
    tool_id: str,
    source: str | None,
    ok: bool,
    duration_ms: int,
    error_code: str | None = None,
    error_message: str | None = None,
    failure_stage: str | None = None,
    arg_keys: list[str] | None = None,
    arg_paths: list[str] | None = None,
    via_batch: bool = False,
    plugin_version: str | None = None,
    host_action_count: int | None = None,
    resume_count: int | None = None,
    plugin_metrics: dict[str, Any] | None = None,
    cwd: Path | None = None,
) -> dict[str, Any] | None:
    event: dict[str, Any] = {
        "event": "tool_call",
        "call_id": uuid.uuid4().hex[:16],
        "tool_id": tool_id,
        "source": source,
        "ok": ok,
        "duration_ms": duration_ms,
        "result_class": classify_result(ok, error_code),
    }
    if arg_keys is not None:
        event["arg_keys"] = sorted(str(key) for key in arg_keys)
    if arg_paths:
        event["arg_paths"] = [str(path) for path in arg_paths if str(path).strip()]
    if not ok:
        event["error_code"] = error_code or "UNSTRUCTURED"
        if error_message and str(error_message).strip():
            event["error_message"] = str(error_message).strip()[:_ERROR_MESSAGE_MAX_LENGTH]
        if failure_stage and str(failure_stage).strip():
            event["failure_stage"] = str(failure_stage).strip()[:64]
    if via_batch:
        event["via_batch"] = True
    if plugin_version:
        event["plugin_version"] = str(plugin_version)[:32]
    if isinstance(host_action_count, int) and host_action_count >= 0:
        event["host_action_count"] = host_action_count
    if isinstance(resume_count, int) and resume_count >= 0:
        event["resume_count"] = resume_count
    sanitized_metrics = _sanitize_plugin_metrics(plugin_metrics)
    if sanitized_metrics:
        event["plugin_metrics"] = sanitized_metrics
    return record_event(event, cwd=cwd)


def recent_call_summaries(cwd: Path | None = None, *, limit: int = 5) -> list[dict[str, Any]]:
    from .session import SessionStore

    payload = SessionStore(cwd or Path.cwd()).read(compact=True)
    summaries: list[dict[str, Any]] = []
    for call in payload.get("recent_calls") or []:
        if not isinstance(call, dict):
            continue
        summaries.append(
            {
                "tool_id": call.get("tool_id"),
                "ok": call.get("ok"),
                "error_code": call.get("error_code"),
            }
        )
        if len(summaries) >= limit:
            break
    return summaries


def validate_feedback_payload(code: str | None, note: str | None) -> None:
    from .errors import CliError

    if code not in FEEDBACK_CODES:
        raise CliError(
            "Invalid feedback code",
            code="FEEDBACK_CODE_INVALID",
            details={"code": code, "allowed": FEEDBACK_CODES},
            hint="用 `indesign-cli tool schema feedback.report` 查看允许的 code。",
        )
    if not isinstance(note, str) or not note.strip():
        raise CliError("Feedback note is required", code="FEEDBACK_NOTE_REQUIRED")
    if len(note) > 500:
        raise CliError(
            "Feedback note must be 500 characters or fewer",
            code="FEEDBACK_NOTE_TOO_LONG",
            details={"maxLength": 500},
            hint="只保留摩擦点摘要；不要包含客户内容、客户名称或文件路径。",
        )
