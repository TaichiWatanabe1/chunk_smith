"""
ChunkSmith Hybrid - Storage Layer
JSON file persistence for sessions, jobs, and batches
"""

import json
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from .config import settings
from .errors import BatchNotFoundError, JobNotFoundError, SessionNotFoundError
from .logging import get_logger
from .models import Batch, Session

logger = get_logger(__name__)


def _ensure_dir(path: Path) -> None:
    """Ensure directory exists."""
    path.mkdir(parents=True, exist_ok=True)


def _get_sessions_dir() -> Path:
    """Get sessions storage directory."""
    return Path(settings.CHUNKSMITH_STORAGE_DIR) / "sessions"


def _get_jobs_dir() -> Path:
    """Get jobs storage directory."""
    return Path(settings.CHUNKSMITH_STORAGE_DIR) / "jobs"


def _get_batches_dir() -> Path:
    """Get batches storage directory."""
    return Path(settings.CHUNKSMITH_STORAGE_DIR) / "batches"


def _purge_dir_contents(path: Path) -> None:
    """
    Delete all files/directories inside `path` (best-effort), preserving `.gitkeep`.

    This keeps the working tree clean while still clearing persisted state for PoC usage.
    """
    if not path.exists():
        return

    for child in path.iterdir():
        if child.name == ".gitkeep":
            continue
        try:
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
        except Exception as e:
            logger.warning(f"Failed to delete {child}: {e}")


def purge_storage() -> None:
    """
    Purge persisted sessions/jobs/batches under `CHUNKSMITH_STORAGE_DIR`.

    Intended for PoC/dev: clear state between runs to avoid referencing stale sessions.
    """
    _purge_dir_contents(_get_sessions_dir())
    _purge_dir_contents(_get_jobs_dir())
    _purge_dir_contents(_get_batches_dir())


def _datetime_serializer(obj: Any) -> Any:
    """JSON serializer for datetime objects."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _safe_write(path: Path, data: str) -> None:
    """
    Safely write data to file using atomic write pattern.
    Write to temp file first, then rename (os.replace for atomicity).
    """
    _ensure_dir(path.parent)

    # Create temp file in same directory to ensure same filesystem
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(data)
        # Atomic replace
        os.replace(tmp_path, path)
    except Exception:
        # Clean up temp file on error
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def save_session(session: Session) -> None:
    """
    Save session to JSON file.

    Args:
        session: Session object to save
    """
    sessions_dir = _get_sessions_dir()
    file_path = sessions_dir / f"{session.session_id}.json"

    data = session.model_dump(mode="json")
    json_str = json.dumps(data, ensure_ascii=False, indent=2, default=_datetime_serializer)
    _safe_write(file_path, json_str)


def load_session(session_id: str) -> Session:
    """
    Load session from JSON file.

    Args:
        session_id: Session identifier

    Returns:
        Session object

    Raises:
        SessionNotFoundError: If session file doesn't exist
    """
    sessions_dir = _get_sessions_dir()
    file_path = sessions_dir / f"{session_id}.json"

    if not file_path.exists():
        raise SessionNotFoundError(session_id)

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return Session(**data)


def delete_session(session_id: str) -> bool:
    """
    Delete session file.

    Args:
        session_id: Session identifier

    Returns:
        True if deleted, False if not found
    """
    sessions_dir = _get_sessions_dir()
    file_path = sessions_dir / f"{session_id}.json"

    if file_path.exists():
        file_path.unlink()
        return True
    return False


def list_sessions() -> list[str]:
    """
    List all session IDs.

    Returns:
        List of session IDs
    """
    sessions_dir = _get_sessions_dir()
    if not sessions_dir.exists():
        return []

    return [f.stem for f in sessions_dir.glob("*.json")]


def save_job(job: Dict[str, Any]) -> None:
    """
    Save job state to JSON file.

    Args:
        job: Job dictionary (must contain 'job_id')
    """
    jobs_dir = _get_jobs_dir()
    job_id = job["job_id"]
    file_path = jobs_dir / f"{job_id}.json"

    json_str = json.dumps(job, ensure_ascii=False, indent=2, default=_datetime_serializer)
    _safe_write(file_path, json_str)


def load_job(job_id: str) -> Dict[str, Any]:
    """
    Load job from JSON file.

    Args:
        job_id: Job identifier

    Returns:
        Job dictionary

    Raises:
        JobNotFoundError: If job file doesn't exist
    """
    jobs_dir = _get_jobs_dir()
    file_path = jobs_dir / f"{job_id}.json"

    if not file_path.exists():
        raise JobNotFoundError(job_id)

    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def update_job(job_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Update job state.

    Args:
        job_id: Job identifier
        updates: Fields to update

    Returns:
        Updated job dictionary
    """
    job = load_job(job_id)
    job.update(updates)
    save_job(job)
    return job


def list_jobs() -> list[str]:
    """
    List all job IDs.

    Returns:
        List of job IDs
    """
    jobs_dir = _get_jobs_dir()
    if not jobs_dir.exists():
        return []

    return [f.stem for f in jobs_dir.glob("*.json")]


# ==================== Batch Storage ====================


def save_batch(batch: Batch) -> None:
    """
    Save batch to JSON file.

    Args:
        batch: Batch object to save
    """
    batches_dir = _get_batches_dir()
    file_path = batches_dir / f"{batch.batch_id}.json"

    data = batch.model_dump(mode="json")
    json_str = json.dumps(data, ensure_ascii=False, indent=2, default=_datetime_serializer)
    _safe_write(file_path, json_str)


def load_batch(batch_id: str) -> Batch:
    """
    Load batch from JSON file.

    Args:
        batch_id: Batch identifier

    Returns:
        Batch object

    Raises:
        BatchNotFoundError: If batch file doesn't exist
    """
    batches_dir = _get_batches_dir()
    file_path = batches_dir / f"{batch_id}.json"

    if not file_path.exists():
        raise BatchNotFoundError(batch_id)

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return Batch(**data)


def delete_batch(batch_id: str) -> bool:
    """
    Delete batch file.

    Args:
        batch_id: Batch identifier

    Returns:
        True if deleted, False if not found
    """
    batches_dir = _get_batches_dir()
    file_path = batches_dir / f"{batch_id}.json"

    if file_path.exists():
        file_path.unlink()
        return True
    return False


def list_batches() -> list[str]:
    """
    List all batch IDs.

    Returns:
        List of batch IDs
    """
    batches_dir = _get_batches_dir()
    if not batches_dir.exists():
        return []

    return [f.stem for f in batches_dir.glob("*.json")]
