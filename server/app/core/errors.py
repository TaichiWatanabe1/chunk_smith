"""
ChunkSmith Hybrid - Error Handling
Unified error format and exception handlers
"""

from typing import Any, Dict, Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class ChunkSmithError(Exception):
    """Base exception for ChunkSmith errors."""

    def __init__(
        self,
        code: str,
        message: str,
        detail: Optional[Dict[str, Any]] = None,
        status_code: int = 400,
    ):
        self.code = code
        self.message = message
        self.detail = detail or {}
        self.status_code = status_code
        super().__init__(message)

    def to_response(self) -> Dict[str, Any]:
        """Convert to standard error response format."""
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "detail": self.detail,
            }
        }


# Error codes and their default status codes
class ErrorCodes:
    PDF_TOO_LARGE = "PDF_TOO_LARGE"
    PDF_EXTRACT_FAILED = "PDF_EXTRACT_FAILED"
    PAGE_MARKER_INVALID = "PAGE_MARKER_INVALID"
    VERSION_CONFLICT = "VERSION_CONFLICT"
    OPENSEARCH_DIMENSION_MISMATCH = "OPENSEARCH_DIMENSION_MISMATCH"
    EMBEDDING_FAILED = "EMBEDDING_FAILED"
    OPENSEARCH_ERROR = "OPENSEARCH_ERROR"
    JOB_NOT_FOUND = "JOB_NOT_FOUND"
    SESSION_NOT_FOUND = "SESSION_NOT_FOUND"
    CHUNK_NOT_FOUND = "CHUNK_NOT_FOUND"
    BATCH_NOT_FOUND = "BATCH_NOT_FOUND"
    INDEX_NOT_FOUND = "INDEX_NOT_FOUND"
    VALIDATION_ERROR = "VALIDATION_ERROR"


# Pre-defined exceptions
class PDFTooLargeError(ChunkSmithError):
    def __init__(self, size_mb: float, max_mb: int):
        super().__init__(
            code=ErrorCodes.PDF_TOO_LARGE,
            message=f"PDF size ({size_mb:.2f} MB) exceeds maximum ({max_mb} MB)",
            detail={"size_mb": size_mb, "max_mb": max_mb},
            status_code=413,
        )


class PDFExtractFailedError(ChunkSmithError):
    def __init__(self, reason: str):
        super().__init__(
            code=ErrorCodes.PDF_EXTRACT_FAILED,
            message=f"Failed to extract PDF: {reason}",
            detail={"reason": reason},
            status_code=422,
        )


class PageMarkerInvalidError(ChunkSmithError):
    def __init__(self, reason: str, detail: Optional[Dict[str, Any]] = None):
        super().__init__(
            code=ErrorCodes.PAGE_MARKER_INVALID,
            message=f"Page marker validation failed: {reason}",
            detail=detail or {"reason": reason},
            status_code=422,
        )


class VersionConflictError(ChunkSmithError):
    def __init__(self, expected: int, actual: int):
        super().__init__(
            code=ErrorCodes.VERSION_CONFLICT,
            message=f"Version conflict: expected {expected}, but current version is {actual}",
            detail={"expected": expected, "actual": actual},
            status_code=409,
        )


class OpenSearchDimensionMismatchError(ChunkSmithError):
    def __init__(self, index_name: str, expected_dim: int, actual_dim: int):
        super().__init__(
            code=ErrorCodes.OPENSEARCH_DIMENSION_MISMATCH,
            message=f"Dimension mismatch for index '{index_name}': expected {expected_dim}, got {actual_dim}",
            detail={
                "index_name": index_name,
                "expected_dimension": expected_dim,
                "actual_dimension": actual_dim,
            },
            status_code=400,
        )


class EmbeddingFailedError(ChunkSmithError):
    def __init__(self, reason: str):
        super().__init__(
            code=ErrorCodes.EMBEDDING_FAILED,
            message=f"Embedding generation failed: {reason}",
            detail={"reason": reason},
            status_code=500,
        )


class OpenSearchError(ChunkSmithError):
    def __init__(self, reason: str, detail: Optional[Dict[str, Any]] = None):
        super().__init__(
            code=ErrorCodes.OPENSEARCH_ERROR,
            message=f"OpenSearch error: {reason}",
            detail=detail or {"reason": reason},
            status_code=500,
        )


class JobNotFoundError(ChunkSmithError):
    def __init__(self, job_id: str):
        super().__init__(
            code=ErrorCodes.JOB_NOT_FOUND,
            message=f"Job not found: {job_id}",
            detail={"job_id": job_id},
            status_code=404,
        )


class SessionNotFoundError(ChunkSmithError):
    def __init__(self, session_id: str):
        super().__init__(
            code=ErrorCodes.SESSION_NOT_FOUND,
            message=f"Session not found: {session_id}",
            detail={"session_id": session_id},
            status_code=404,
        )


class ChunkNotFoundError(ChunkSmithError):
    def __init__(self, session_id: str, chunk_id: str):
        super().__init__(
            code=ErrorCodes.CHUNK_NOT_FOUND,
            message=f"Chunk not found: {chunk_id} in session {session_id}",
            detail={"session_id": session_id, "chunk_id": chunk_id},
            status_code=404,
        )


class BatchNotFoundError(ChunkSmithError):
    def __init__(self, batch_id: str):
        super().__init__(
            code=ErrorCodes.BATCH_NOT_FOUND,
            message=f"Batch not found: {batch_id}",
            detail={"batch_id": batch_id},
            status_code=404,
        )


class IndexNotFoundError(ChunkSmithError):
    def __init__(self, index_name: str):
        super().__init__(
            code=ErrorCodes.INDEX_NOT_FOUND,
            message=f"Index not found: {index_name}",
            detail={"index_name": index_name},
            status_code=404,
        )


# Exception handlers for FastAPI
async def chunksmith_error_handler(
    request: Request, exc: ChunkSmithError
) -> JSONResponse:
    """Handle ChunkSmithError exceptions."""
    return JSONResponse(status_code=exc.status_code, content=exc.to_response())


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle HTTPException and convert to standard format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": "HTTP_ERROR",
                "message": str(exc.detail),
                "detail": {},
            }
        },
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "detail": {"type": type(exc).__name__, "message": str(exc)},
            }
        },
    )
