"""
ChunkSmith Hybrid - Job Schemas
Data structures for background jobs
"""

from datetime import datetime
from typing import Any, Dict, List, Literal


def create_job(
    job_id: str,
    session_id: str,
    job_type: str = "commit",
    embedding_model: str = "",
    index_name: str = None,
) -> Dict[str, Any]:
    """
    Create a new job record.

    Args:
        job_id: Unique job identifier
        session_id: Associated session ID
        job_type: Type of job (e.g., "commit")
        embedding_model: Embedding model to use
        index_name: Custom index name (optional)

    Returns:
        Job dictionary
    """
    return {
        "job_id": job_id,
        "session_id": session_id,
        "job_type": job_type,
        "embedding_model": embedding_model,
        "index_name": index_name,
        "status": "queued",
        "progress": 0.0,
        "total": 0,
        "succeeded": 0,
        "failed": 0,
        "error_samples": [],
        "created_at": datetime.utcnow().isoformat(),
        "started_at": None,
        "completed_at": None,
        "error": None,
    }


def update_job_status(
    job: Dict[str, Any],
    status: Literal["queued", "running", "succeeded", "failed"],
    progress: float = None,
    total: int = None,
    succeeded: int = None,
    failed: int = None,
    error: str = None,
    error_samples: List[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Update job status fields.

    Args:
        job: Job dictionary to update
        status: New status
        progress: Progress (0.0 to 1.0)
        total: Total items
        succeeded: Succeeded count
        failed: Failed count
        error: Error message
        error_samples: Sample errors for debugging

    Returns:
        Updated job dictionary
    """
    job["status"] = status

    if progress is not None:
        job["progress"] = progress
    if total is not None:
        job["total"] = total
    if succeeded is not None:
        job["succeeded"] = succeeded
    if failed is not None:
        job["failed"] = failed
    if error is not None:
        job["error"] = error
    if error_samples is not None:
        job["error_samples"] = error_samples

    # Update timestamps
    if status == "running" and job.get("started_at") is None:
        job["started_at"] = datetime.utcnow().isoformat()
    elif status in ("succeeded", "failed"):
        job["completed_at"] = datetime.utcnow().isoformat()

    return job
