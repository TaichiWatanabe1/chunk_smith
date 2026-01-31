"""
ChunkSmith Hybrid - Jobs API
Job status and progress tracking
"""

from fastapi import APIRouter

from ..core.models import JobStatusResponse
from ..core.storage import load_job

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str) -> JobStatusResponse:
    """
    Get job status and progress.

    Returns current status, progress percentage, and error samples if failed.
    """
    job = load_job(job_id)

    return JobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        progress=job.get("progress", 0.0),
        total=job.get("total", 0),
        succeeded=job.get("succeeded", 0),
        failed=job.get("failed", 0),
        error_samples=job.get("error_samples", []),
    )
