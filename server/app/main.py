"""
ChunkSmith Hybrid - FastAPI Application
Main application entry point
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .api import batches, chunks, embedding, indices, jobs, search, sessions
from .core.config import settings
from .core.errors import (
    ChunkSmithError,
    chunksmith_error_handler,
    generic_exception_handler,
    http_exception_handler,
)
from .core.models import HealthResponse
from .core.storage import purge_storage
from .integrations.openai_models import initialize_embedding_models

# Create FastAPI app
app = FastAPI(
    title="ChunkSmith Hybrid",
    description="PDF extraction, chunking, and OpenSearch indexing API",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CHUNKSMITH_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register exception handlers
app.add_exception_handler(ChunkSmithError, chunksmith_error_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Register routers
app.include_router(sessions.router)
app.include_router(batches.router)
app.include_router(chunks.router)
app.include_router(search.router)
app.include_router(jobs.router)
app.include_router(embedding.router)
app.include_router(indices.router)


@app.on_event("startup")
def _startup_init() -> None:
    if settings.CHUNKSMITH_CLEAR_STORAGE_ON_STARTUP:
        purge_storage()
    initialize_embedding_models()


@app.get("/healthz", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="ok", env=settings.CHUNKSMITH_ENV)


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "ChunkSmith Hybrid",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/healthz",
    }
