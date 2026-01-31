"""
ChunkSmith Hybrid - Batches API
Manage batch operations for folder-based PDF processing
"""

import threading
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, File, Form, UploadFile

from ..core.chunking import build_page_map, chunk_pages
from ..core.config import settings
from ..core.errors import PDFTooLargeError
from ..core.models import (
    Batch,
    BatchFileInfo,
    BatchResponse,
    BatchListResponse,
    BatchCommitRequest,
    BatchCommitResponse,
    ChunkStrategy,
    Session,
    ChildChunk,
    ChunkMetadata,
    ExtractMeta,
    PageSpan,
    RawPage,
)
from ..core.normalize import normalize_pages
from ..core.page_marker import build_text
from ..core.storage import (
    load_batch,
    load_session,
    save_batch,
    save_session,
    list_batches,
    delete_batch,
)
from ..integrations.pdf_extractor import extract_pdf_to_pages
from ..integrations.jsonl_parser import parse_jsonl
from ..core.hashing import hash_chunk
from ..integrations.jsonl_parser import JSONLParseError
from ..jobs import create_job, run_commit_job
from ..core.storage import save_job

router = APIRouter(prefix="/api/batches", tags=["batches"])


def is_probably_jsonl(filename: Optional[str], content: bytes) -> bool:
    """
    Heuristic to detect whether an uploaded file is JSONL/NDJSON.

    - Trusts filename extensions `.jsonl` and `.ndjson` (also `.json` as permissive)
    - Otherwise, strips leading whitespace and checks the first byte for `{` or `[`.
    """
    try:
        if filename:
            lower = filename.lower()
            if lower.endswith(('.jsonl', '.ndjson', '.json')):
                return True

        if not content:
            return False

        s = content.lstrip()
        if not s:
            return False

        first = s[:1]
        if first in (b'{', b'['):
            return True
    except Exception:
        return False

    return False


@router.post("", response_model=BatchResponse)
async def create_batch(
    files: List[UploadFile] = File(...),
    batch_name: Optional[str] = Form(None),
) -> BatchResponse:
    """
    Create a new batch by uploading multiple PDFs.

    - Creates a batch to group sessions
    - Creates individual sessions for each PDF
    - Returns batch info with session list
    """
    batch_id = str(uuid.uuid4())
    now = datetime.utcnow()

    if not batch_name:
        batch_name = f"Batch-{now.strftime('%Y%m%d-%H%M%S')}"

    file_infos: List[BatchFileInfo] = []
    errors: List[str] = []

    for upload_file in files:
        filename = upload_file.filename or f"unknown-{uuid.uuid4()[:8]}.pdf"

        try:
            # Read file content
            pdf_bytes = await upload_file.read()

            # Detect JSONL vs PDF
            if is_probably_jsonl(upload_file.filename, pdf_bytes):
                try:
                    # Create session for this JSONL import
                    session_id = str(uuid.uuid4())
                    default_doc_id = upload_file.filename or f"jsonl-{session_id[:8]}"

                    jsonl_chunks, warnings = parse_jsonl(pdf_bytes, default_doc_id)

                    # Group chunks by doc_id to form pages
                    doc_groups: dict = {}
                    for jc in jsonl_chunks:
                        doc_key = jc.doc_id or default_doc_id
                        doc_groups.setdefault(doc_key, []).append(jc)

                    base_pages: list[RawPage] = []
                    chunks: list[ChildChunk] = []
                    chunk_metadata: dict = {}

                    CHUNK_SEP = "\n\n---\n\n"
                    current_text_parts: list[str] = []
                    current_offset = 0

                    page_no = 0
                    for doc_key, group_chunks in doc_groups.items():
                        page_no += 1
                        page_texts = []

                        for idx, jc in enumerate(group_chunks):
                            chunk_id = jc.chunk_id or f"P{page_no:03d}-C{idx + 1:03d}"
                            chunk_text = jc.text
                            char_len = len(chunk_text)

                            start = current_offset
                            end = start + char_len

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

                            chunk_metadata[chunk_id] = ChunkMetadata(custom=jc.metadata)

                            page_texts.append(chunk_text)
                            current_text_parts.append(chunk_text)

                            is_last_chunk = (
                                doc_key == list(doc_groups.keys())[-1]
                                and idx == len(group_chunks) - 1
                            )
                            if not is_last_chunk:
                                current_text_parts.append(CHUNK_SEP)
                                current_offset = end + len(CHUNK_SEP)
                            else:
                                current_offset = end

                        page_text = CHUNK_SEP.join(page_texts)
                        base_pages.append(RawPage(page_no=page_no, text=page_text))

                    current_text = "".join(current_text_parts)

                    # Build page_map
                    offset = 0
                    page_map: list[PageSpan] = []
                    for page in base_pages:
                        page_len = len(page.text)
                        page_map.append(
                            PageSpan(
                                page_no=page.page_no,
                                start=offset,
                                end=offset + page_len,
                                char_len=page_len,
                                hash=hash_chunk(default_doc_id, f"page-{page.page_no}", page.text),
                            )
                        )
                        offset += page_len
                        if page.page_no < len(base_pages):
                            offset += len(CHUNK_SEP)

                    extract_meta = ExtractMeta(
                        extractor_name="jsonl_import",
                        extractor_version="1.0",
                        page_count=len(base_pages),
                        warnings=warnings,
                        created_at=datetime.utcnow(),
                    )

                    chunk_strategy = ChunkStrategy(
                        chunk_size=settings.DEFAULT_CHUNK_SIZE,
                        overlap=0,
                        split_mode="chars",
                        normalize=False,
                    )

                    now = datetime.utcnow()
                    session = Session(
                        session_id=session_id,
                        doc_id=default_doc_id,
                        batch_id=batch_id,
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

                    save_session(session)

                    file_infos.append(
                        BatchFileInfo(
                            filename=filename,
                            session_id=session_id,
                            status="ready",
                            chunk_count=len(chunks),
                            page_count=extract_meta.page_count,
                        )
                    )
                    continue
                except JSONLParseError as e:
                    errors.append(f"{filename}: JSONL parse error: {str(e)}")
                    file_infos.append(
                        BatchFileInfo(
                            filename=filename,
                            session_id=None,
                            status="error",
                            error=str(e),
                        )
                    )
                    continue

            # Check file size
            size_mb = len(pdf_bytes) / (1024 * 1024)
            if size_mb > settings.CHUNKSMITH_MAX_PDF_MB:
                errors.append(f"{filename}: File too large ({size_mb:.1f}MB)")
                file_infos.append(
                    BatchFileInfo(
                        filename=filename,
                        session_id=None,
                        status="error",
                        error=f"File too large ({size_mb:.1f}MB > {settings.CHUNKSMITH_MAX_PDF_MB}MB)",
                    )
                )
                continue

            # Create session for this PDF
            session_id = str(uuid.uuid4())
            doc_id = filename

            # Extract PDF
            try:
                base_pages, extract_meta = extract_pdf_to_pages(
                    pdf_bytes, settings.PDF_EXTRACTOR_VERSION
                )
            except Exception as e:
                errors.append(f"{filename}: PDF extraction error: {str(e)}")
                file_infos.append(
                    BatchFileInfo(
                        filename=filename,
                        session_id=None,
                        status="error",
                        error=f"PDF extraction error: {str(e)}",
                    )
                )
                continue

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
            chunks = chunk_pages(
                current_text, page_map, current_pages, chunk_strategy, doc_id
            )

            # Create session
            session = Session(
                session_id=session_id,
                doc_id=doc_id,
                batch_id=batch_id,  # Link to batch
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

            file_infos.append(
                BatchFileInfo(
                    filename=filename,
                    session_id=session_id,
                    status="ready",
                    chunk_count=len(chunks),
                    page_count=extract_meta.page_count,
                )
            )

        except Exception as e:
            errors.append(f"{filename}: {str(e)}")
            file_infos.append(
                BatchFileInfo(
                    filename=filename,
                    session_id=None,
                    status="error",
                    error=str(e),
                )
            )

    # Create batch
    batch = Batch(
        batch_id=batch_id,
        name=batch_name,
        files=file_infos,
        created_at=now,
        updated_at=now,
    )

    # Save batch
    save_batch(batch)

    return BatchResponse.from_batch(batch)


@router.get("", response_model=BatchListResponse)
async def get_batches() -> BatchListResponse:
    """
    List all batches.
    """
    batch_ids = list_batches()
    batches = []

    for bid in batch_ids:
        try:
            batch = load_batch(bid)
            batches.append(BatchResponse.from_batch(batch))
        except Exception:
            pass  # Skip corrupted batches

    # Sort by created_at descending
    batches.sort(key=lambda b: b.created_at, reverse=True)

    return BatchListResponse(batches=batches)


@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch(batch_id: str) -> BatchResponse:
    """
    Get batch by ID with updated file statuses.
    """
    batch = load_batch(batch_id)

    # Update file statuses from sessions
    for file_info in batch.files:
        if file_info.session_id:
            try:
                session = load_session(file_info.session_id)
                file_info.chunk_count = len(session.chunks)
                file_info.page_count = session.extract_meta.page_count
                # Check if committed (has job completed)
                # For now, status remains as-is
            except Exception:
                file_info.status = "error"
                file_info.error = "Session not found"

    return BatchResponse.from_batch(batch)


@router.delete("/{batch_id}")
async def remove_batch(batch_id: str) -> dict:
    """
    Delete a batch (does not delete sessions).
    """
    delete_batch(batch_id)
    return {"deleted": True, "batch_id": batch_id}


@router.post("/{batch_id}/files", response_model=BatchResponse)
async def add_files_to_batch(
    batch_id: str,
    files: List[UploadFile] = File(...),
) -> BatchResponse:
    """
    Add more PDF files to an existing batch.
    """
    batch = load_batch(batch_id)
    now = datetime.utcnow()

    for upload_file in files:
        filename = upload_file.filename or f"unknown-{uuid.uuid4()[:8]}.pdf"

        try:
            # Read file content
            pdf_bytes = await upload_file.read()

            # Detect JSONL vs PDF and handle per-file
            if is_probably_jsonl(upload_file.filename, pdf_bytes):
                try:
                    session_id = str(uuid.uuid4())
                    default_doc_id = upload_file.filename or f"jsonl-{session_id[:8]}"

                    jsonl_chunks, warnings = parse_jsonl(pdf_bytes, default_doc_id)

                    # Group chunks by doc_id to form pages
                    doc_groups: dict = {}
                    for jc in jsonl_chunks:
                        doc_key = jc.doc_id or default_doc_id
                        doc_groups.setdefault(doc_key, []).append(jc)

                    base_pages: list[RawPage] = []
                    chunks: list[ChildChunk] = []
                    chunk_metadata: dict = {}

                    CHUNK_SEP = "\n\n---\n\n"
                    current_text_parts: list[str] = []
                    current_offset = 0

                    page_no = 0
                    for doc_key, group_chunks in doc_groups.items():
                        page_no += 1
                        page_texts = []

                        for idx, jc in enumerate(group_chunks):
                            chunk_id = jc.chunk_id or f"P{page_no:03d}-C{idx + 1:03d}"
                            chunk_text = jc.text
                            char_len = len(chunk_text)

                            start = current_offset
                            end = start + char_len

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

                            chunk_metadata[chunk_id] = ChunkMetadata(custom=jc.metadata)

                            page_texts.append(chunk_text)
                            current_text_parts.append(chunk_text)

                            is_last_chunk = (
                                doc_key == list(doc_groups.keys())[-1]
                                and idx == len(group_chunks) - 1
                            )
                            if not is_last_chunk:
                                current_text_parts.append(CHUNK_SEP)
                                current_offset = end + len(CHUNK_SEP)
                            else:
                                current_offset = end

                        page_text = CHUNK_SEP.join(page_texts)
                        base_pages.append(RawPage(page_no=page_no, text=page_text))

                    current_text = "".join(current_text_parts)

                    # Build page_map
                    offset = 0
                    page_map: list[PageSpan] = []
                    for page in base_pages:
                        page_len = len(page.text)
                        page_map.append(
                            PageSpan(
                                page_no=page.page_no,
                                start=offset,
                                end=offset + page_len,
                                char_len=page_len,
                                hash=hash_chunk(default_doc_id, f"page-{page.page_no}", page.text),
                            )
                        )
                        offset += page_len
                        if page.page_no < len(base_pages):
                            offset += len(CHUNK_SEP)

                    extract_meta = ExtractMeta(
                        extractor_name="jsonl_import",
                        extractor_version="1.0",
                        page_count=len(base_pages),
                        warnings=warnings,
                        created_at=datetime.utcnow(),
                    )

                    chunk_strategy = ChunkStrategy(
                        chunk_size=settings.DEFAULT_CHUNK_SIZE,
                        overlap=0,
                        split_mode="chars",
                        normalize=False,
                    )

                    now = datetime.utcnow()
                    session = Session(
                        session_id=session_id,
                        doc_id=default_doc_id,
                        batch_id=batch_id,
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

                    save_session(session)

                    batch.files.append(
                        BatchFileInfo(
                            filename=filename,
                            session_id=session_id,
                            status="ready",
                            chunk_count=len(chunks),
                            page_count=extract_meta.page_count,
                        )
                    )
                    continue
                except JSONLParseError as e:
                    batch.files.append(
                        BatchFileInfo(
                            filename=filename,
                            session_id=None,
                            status="error",
                            error=str(e),
                        )
                    )
                    continue

            # Check file size
            size_mb = len(pdf_bytes) / (1024 * 1024)
            if size_mb > settings.CHUNKSMITH_MAX_PDF_MB:
                batch.files.append(
                    BatchFileInfo(
                        filename=filename,
                        session_id=None,
                        status="error",
                        error=f"File too large ({size_mb:.1f}MB > {settings.CHUNKSMITH_MAX_PDF_MB}MB)",
                    )
                )
                continue

            # Create session for this PDF
            session_id = str(uuid.uuid4())
            doc_id = filename

            # Extract PDF
            try:
                base_pages, extract_meta = extract_pdf_to_pages(
                    pdf_bytes, settings.PDF_EXTRACTOR_VERSION
                )
            except Exception as e:
                batch.files.append(
                    BatchFileInfo(
                        filename=filename,
                        session_id=None,
                        status="error",
                        error=f"PDF extraction error: {str(e)}",
                    )
                )
                continue

        except Exception as e:
            batch.files.append(
                BatchFileInfo(
                    filename=filename,
                    session_id=None,
                    status="error",
                    error=str(e),
                )
            )

    # Update batch
    batch.updated_at = now
    save_batch(batch)

    return BatchResponse.from_batch(batch)


@router.post("/{batch_id}/commit", response_model=BatchCommitResponse)
async def commit_batch(batch_id: str, request: BatchCommitRequest) -> BatchCommitResponse:
    """
    Commit all ready sessions in a batch.

    Creates individual jobs for each session and returns job IDs.
    If index_name is provided, all sessions are committed to that index.
    """
    batch = load_batch(batch_id)
    job_ids: List[str] = []
    job_session_map: dict[str, str] = {}  # job_id -> session_id
    skipped: List[str] = []

    for file_info in batch.files:
        if file_info.status != "ready" or not file_info.session_id:
            if file_info.filename:
                skipped.append(file_info.filename)
            continue

        try:
            session = load_session(file_info.session_id)

            # Create job for this session
            job_id = str(uuid.uuid4())
            job = create_job(
                job_id=job_id,
                session_id=session.session_id,
                job_type="commit",
                embedding_model=request.embedding_model,
                index_name=request.index_name,
            )
            save_job(job)

            # Start job in background thread
            thread = threading.Thread(
                target=run_commit_job,
                args=(job,),
                daemon=True,
            )
            thread.start()

            job_ids.append(job_id)
            job_session_map[job_id] = session.session_id

            # Update file status
            file_info.status = "committing"
            file_info.job_id = job_id

        except Exception as e:
            file_info.status = "error"
            file_info.error = str(e)
            skipped.append(file_info.filename)

    # Save updated batch
    batch.updated_at = datetime.utcnow()
    save_batch(batch)

    return BatchCommitResponse(
        batch_id=batch_id,
        job_ids=job_ids,
        job_session_map=job_session_map,
        skipped_files=skipped,
        total_jobs=len(job_ids),
    )


@router.put("/{batch_id}/files/{session_id}/status")
async def update_file_status(
    batch_id: str,
    session_id: str,
    status: str,
    job_id: Optional[str] = None,
) -> dict:
    """
    Update a file's status in the batch.
    """
    batch = load_batch(batch_id)

    for file_info in batch.files:
        if file_info.session_id == session_id:
            file_info.status = status
            if job_id:
                file_info.job_id = job_id
            break

    batch.updated_at = datetime.utcnow()
    save_batch(batch)

    return {"updated": True}
