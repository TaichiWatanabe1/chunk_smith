"""
ChunkSmith Hybrid - Chunks API
Get chunk details and update metadata
"""

from fastapi import APIRouter

from ..core.errors import ChunkNotFoundError
from ..core.models import (
    ChunkDetailResponse,
    ChunkMetadata,
    UpdateChunkMetadataRequest,
)
from ..core.storage import load_session, save_session

router = APIRouter(prefix="/api/sessions", tags=["chunks"])


@router.get("/{session_id}/chunks/{chunk_id}", response_model=ChunkDetailResponse)
async def get_chunk_detail(session_id: str, chunk_id: str) -> ChunkDetailResponse:
    """
    Get detailed information about a specific chunk.

    Returns chunk position, content, strategy, and metadata.
    """
    session = load_session(session_id)

    # Find chunk
    chunk = next((c for c in session.chunks if c.chunk_id == chunk_id), None)
    if chunk is None:
        raise ChunkNotFoundError(session_id, chunk_id)

    # Get chunk text
    text = session.current_text[chunk.start : chunk.end]

    # Get metadata (or default)
    metadata = session.chunk_metadata.get(chunk_id, ChunkMetadata())

    return ChunkDetailResponse(
        doc_id=session.doc_id,
        session_id=session.session_id,
        chunk_id=chunk.chunk_id,
        page_no=chunk.page_no,
        start=chunk.start,
        end=chunk.end,
        char_len=chunk.char_len,
        text=text,
        extractor_version=session.extract_meta.extractor_version,
        chunk_strategy=session.chunk_strategy,
        hash=chunk.hash,
        warnings=chunk.warnings,
        metadata=metadata,
    )


@router.put("/{session_id}/chunks/{chunk_id}/metadata")
async def update_chunk_metadata(
    session_id: str,
    chunk_id: str,
    request: UpdateChunkMetadataRequest,
) -> dict:
    """
    Update metadata for a specific chunk.

    Updates content_type, heading_path, note, and quality_flag.
    """
    session = load_session(session_id)

    # Verify chunk exists
    chunk = next((c for c in session.chunks if c.chunk_id == chunk_id), None)
    if chunk is None:
        raise ChunkNotFoundError(session_id, chunk_id)

    # Update metadata
    session.chunk_metadata[chunk_id] = ChunkMetadata(
        content_type=request.content_type,
        heading_path=request.heading_path,
        note=request.note,
        quality_flag=request.quality_flag,
    )

    # Save session
    save_session(session)

    return {"ok": True}
