"""
ChunkSmith Hybrid - Sessions API
Create, read, update sessions and commit to OpenSearch
"""

import threading
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, Form, UploadFile

from ..core.chunking import build_page_map, chunk_pages
from ..core.config import settings
from ..core.errors import PDFTooLargeError, VersionConflictError
from ..core.hashing import hash_chunk
from ..core.models import (
    ChildChunk,
    ChunkMetadata,
    ChunkStrategy,
    CommitRequest,
    CommitResponse,
    ExtractMeta,
    PageSpan,
    RawPage,
    Session,
    SessionResponse,
    UpdateChunkStrategyRequest,
    UpdateChunkStrategyResponse,
    UpdateTextRequest,
    UpdateTextResponse,
)
from ..core.normalize import normalize_pages
from ..core.page_marker import build_text, parse_text
from ..core.storage import load_session, save_session
from ..integrations.pdf_extractor import extract_pdf_to_pages
from ..integrations.jsonl_parser import parse_jsonl, validate_jsonl_preview, JSONLParseError
from ..jobs import create_job, run_commit_job
from ..core.storage import save_job

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse)
async def create_session(
    file: UploadFile = File(...),
    doc_id: Optional[str] = Form(None),
) -> SessionResponse:
    """
    Create a new session by uploading a PDF.

    - Extracts text from PDF using PyMuPDF
    - Generates page markers and initial chunking
    - Returns full session state
    """
    # Read file content
    pdf_bytes = await file.read()

    # Check file size
    size_mb = len(pdf_bytes) / (1024 * 1024)
    if size_mb > settings.CHUNKSMITH_MAX_PDF_MB:
        raise PDFTooLargeError(size_mb, settings.CHUNKSMITH_MAX_PDF_MB)

    # Generate IDs
    session_id = str(uuid.uuid4())
    if not doc_id:
        doc_id = file.filename or f"doc-{session_id[:8]}"

    # Extract PDF
    base_pages, extract_meta = extract_pdf_to_pages(
        pdf_bytes, settings.PDF_EXTRACTOR_VERSION
    )

    # Default chunk strategy
    chunk_strategy = ChunkStrategy(
        chunk_size=settings.DEFAULT_CHUNK_SIZE,
        overlap=settings.DEFAULT_OVERLAP,
        split_mode=settings.DEFAULT_SPLIT_MODE,
        normalize=settings.DEFAULT_NORMALIZE,
    )

    # Apply normalization if enabled
    if chunk_strategy.normalize:
        current_pages = normalize_pages(base_pages)
    else:
        current_pages = base_pages.copy()

    # Build full text with page markers
    current_text = build_text(current_pages)

    # Build page map and chunks
    page_map = build_page_map(current_text, current_pages, doc_id)
    chunks = chunk_pages(current_text, page_map, current_pages, chunk_strategy, doc_id)

    # Create session
    now = datetime.utcnow()
    session = Session(
        session_id=session_id,
        doc_id=doc_id,
        extract_meta=extract_meta,
        base_pages=base_pages,
        current_pages=current_pages,
        current_text=current_text,
        page_map=page_map,
        chunk_strategy=chunk_strategy,
        chunks=chunks,
        chunk_metadata={},
        version=1,
        created_at=now,
        updated_at=now,
    )

    # Save session
    save_session(session)

    return SessionResponse.from_session(session)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str) -> SessionResponse:
    """
    Get session by ID.

    Returns full session state including current text, page map, and chunks.
    """
    session = load_session(session_id)
    return SessionResponse.from_session(session)


@router.put("/{session_id}/text", response_model=UpdateTextResponse)
async def update_text(session_id: str, request: UpdateTextRequest) -> UpdateTextResponse:
    """
    Update the full text content.

    - Validates page markers
    - Re-parses pages from markers
    - Applies normalization if enabled
    - Recalculates page map and chunks
    - Increments version (optimistic locking)
    """
    session = load_session(session_id)

    # Check version
    if request.version != session.version:
        raise VersionConflictError(request.version, session.version)

    # Parse pages from new text
    current_pages = parse_text(request.current_text, session.extract_meta.page_count)

    # Apply normalization if enabled
    if session.chunk_strategy.normalize:
        current_pages = normalize_pages(current_pages)

    # Rebuild text (normalized)
    current_text = build_text(current_pages)

    # Recalculate page map and chunks
    page_map = build_page_map(current_text, current_pages, session.doc_id)
    chunks = chunk_pages(
        current_text, page_map, current_pages, session.chunk_strategy, session.doc_id
    )

    # Update session
    session.current_pages = current_pages
    session.current_text = current_text
    session.page_map = page_map
    session.chunks = chunks
    session.version += 1
    session.updated_at = datetime.utcnow()

    # Save
    save_session(session)

    return UpdateTextResponse(
        version=session.version,
        current_text=session.current_text,
        page_map=session.page_map,
        chunks=session.chunks,
    )


@router.put("/{session_id}/chunk_strategy", response_model=UpdateChunkStrategyResponse)
async def update_chunk_strategy(
    session_id: str, request: UpdateChunkStrategyRequest
) -> UpdateChunkStrategyResponse:
    """
    Update the chunking strategy.

    - Applies new normalization setting if changed
    - Recalculates page map and chunks with new strategy
    - Increments version (optimistic locking)
    """
    session = load_session(session_id)

    # Check version
    if request.version != session.version:
        raise VersionConflictError(request.version, session.version)

    # Update strategy
    session.chunk_strategy = request.chunk_strategy

    # Re-normalize if setting changed
    if request.chunk_strategy.normalize:
        current_pages = normalize_pages(session.base_pages)
    else:
        current_pages = [p.model_copy() for p in session.base_pages]

    # Rebuild text
    current_text = build_text(current_pages)

    # Recalculate page map and chunks
    page_map = build_page_map(current_text, current_pages, session.doc_id)
    chunks = chunk_pages(
        current_text, page_map, current_pages, request.chunk_strategy, session.doc_id
    )

    # Update session
    session.current_pages = current_pages
    session.current_text = current_text
    session.page_map = page_map
    session.chunks = chunks
    session.version += 1
    session.updated_at = datetime.utcnow()

    # Save
    save_session(session)

    return UpdateChunkStrategyResponse(
        chunk_strategy=session.chunk_strategy,
        page_map=session.page_map,
        chunks=session.chunks,
    )


@router.post("/{session_id}/commit", response_model=CommitResponse)
async def commit_session(session_id: str, request: CommitRequest) -> CommitResponse:
    """
    Commit session to OpenSearch.

    - Creates a background job
    - Generates embeddings for all chunks
    - Bulk inserts into OpenSearch
    - Returns job ID for progress tracking
    
    If index_name is provided, uses that index (validates dimension).
    Otherwise, auto-generates index name from embedding model.
    """
    # Verify session exists
    session = load_session(session_id)

    # Create job
    job_id = str(uuid.uuid4())
    job = create_job(
        job_id=job_id,
        session_id=session_id,
        job_type="commit",
        embedding_model=request.embedding_model,
        index_name=request.index_name,
    )

    # Save initial job state
    save_job(job)

    # Start background thread
    thread = threading.Thread(target=run_commit_job, args=(job,), daemon=True)
    thread.start()

    return CommitResponse(job_id=job_id)


# ==================== JSONL Import ====================


@router.post("/jsonl/preview")
async def preview_jsonl(
    file: UploadFile = File(...),
    doc_id: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """
    Preview JSONL file before import.

    Returns validation result and sample chunks.
    """
    content = await file.read()
    default_doc_id = doc_id or file.filename or "imported"

    try:
        return validate_jsonl_preview(content, default_doc_id)
    except JSONLParseError as e:
        return {
            "error": str(e),
            "total_chunks": 0,
            "preview": [],
            "warnings": [],
            "doc_ids": [],
        }


@router.post("/jsonl", response_model=SessionResponse)
async def create_jsonl_session(
    file: UploadFile = File(...),
    doc_id: Optional[str] = Form(None),
) -> SessionResponse:
    """
    Create a session from JSONL file.

    Each line in JSONL becomes a chunk. The session can be
    viewed and edited in the same UI as PDF sessions.

    JSONL format:
    {"text": "chunk content", "doc_id": "optional", "chunk_id": "optional", "metadata": {...}}
    """
    content = await file.read()

    # Check file size (use same limit as PDF)
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.CHUNKSMITH_MAX_PDF_MB:
        raise PDFTooLargeError(size_mb, settings.CHUNKSMITH_MAX_PDF_MB)

    # Generate IDs
    session_id = str(uuid.uuid4())
    default_doc_id = doc_id or file.filename or f"jsonl-{session_id[:8]}"

    # Parse JSONL
    jsonl_chunks, warnings = parse_jsonl(content, default_doc_id)

    # Group chunks by doc_id for "pages"
    doc_groups: Dict[str, list] = {}
    for jc in jsonl_chunks:
        doc_key = jc.doc_id or default_doc_id
        if doc_key not in doc_groups:
            doc_groups[doc_key] = []
        doc_groups[doc_key].append(jc)

    # Build pages (one per doc_id group)
    base_pages: list[RawPage] = []
    chunks: list[ChildChunk] = []
    chunk_metadata: Dict[str, ChunkMetadata] = {}

    # Chunk separator for display
    CHUNK_SEP = "\n\n---\n\n"
    current_text_parts: list[str] = []
    current_offset = 0
    page_map: list[PageSpan] = []

    page_no = 0
    for doc_key, group_chunks in doc_groups.items():
        page_no += 1
        page_texts = []

        for idx, jc in enumerate(group_chunks):
            chunk_id = jc.chunk_id or f"P{page_no:03d}-C{idx + 1:03d}"
            chunk_text = jc.text
            char_len = len(chunk_text)

            # Calculate positions
            start = current_offset
            end = start + char_len

            # Create chunk
            chunk = ChildChunk(
                chunk_id=chunk_id,
                page_no=page_no,
                start=start,
                end=end,
                char_len=char_len,
                hash=hash_chunk(default_doc_id, chunk_id, chunk_text),
                warnings=[],
            )
            chunks.append(chunk)

            # Store metadata (including custom fields from JSONL)
            chunk_metadata[chunk_id] = ChunkMetadata(custom=jc.metadata)

            page_texts.append(chunk_text)
            current_text_parts.append(chunk_text)

            # Add separator (except for last chunk of last page)
            is_last_chunk = (doc_key == list(doc_groups.keys())[-1] and 
                           idx == len(group_chunks) - 1)
            if not is_last_chunk:
                current_text_parts.append(CHUNK_SEP)
                current_offset = end + len(CHUNK_SEP)
            else:
                current_offset = end

        # Create page
        page_text = CHUNK_SEP.join(page_texts)
        base_pages.append(RawPage(page_no=page_no, text=page_text))

    # Build current_text
    current_text = "".join(current_text_parts)

    # Rebuild page_map with correct offsets
    offset = 0
    page_map = []
    for page in base_pages:
        page_len = len(page.text)
        page_map.append(PageSpan(
            page_no=page.page_no,
            start=offset,
            end=offset + page_len,
            char_len=page_len,
            hash=hash_chunk(default_doc_id, f"page-{page.page_no}", page.text),
        ))
        # Account for separator
        offset += page_len
        if page.page_no < len(base_pages):
            offset += len(CHUNK_SEP)

    # Create extract metadata
    extract_meta = ExtractMeta(
        extractor_name="jsonl_import",
        extractor_version="1.0",
        page_count=len(base_pages),
        warnings=warnings,
        created_at=datetime.utcnow(),
    )

    # Chunk strategy (read-only for JSONL, chunks are pre-defined)
    chunk_strategy = ChunkStrategy(
        chunk_size=settings.DEFAULT_CHUNK_SIZE,  # Use default to satisfy validation
        overlap=0,
        split_mode="chars",
        normalize=False,
    )

    # Create session
    now = datetime.utcnow()
    session = Session(
        session_id=session_id,
        doc_id=default_doc_id,
        source_type="jsonl",
        extract_meta=extract_meta,
        base_pages=base_pages,
        current_pages=base_pages.copy(),
        current_text=current_text,
        page_map=page_map,
        chunk_strategy=chunk_strategy,
        chunks=chunks,
        chunk_metadata=chunk_metadata,
        version=1,
        created_at=now,
        updated_at=now,
    )

    # Save session
    save_session(session)

    return SessionResponse.from_session(session)
