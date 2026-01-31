"""
ChunkSmith Hybrid - Job Runner
Background job execution for commit operations
"""

from typing import Any, Dict, List
from datetime import datetime

from ..core.config import settings
from ..core.errors import OpenSearchDimensionMismatchError
from ..core.logging import get_logger
from ..core.models import ChunkMetadata, Session
from ..core.storage import load_session, save_job
from ..integrations.embeddings import get_embedding_provider
from ..integrations.opensearch_client import get_opensearch_client
from ..integrations.opensearch_index_manager import (
    ensure_index,
    get_default_index_name,
    get_index_dimension,
)
from .schemas import update_job_status

logger = get_logger(__name__)


def run_commit_job(job: Dict[str, Any]) -> None:
    """
    Execute a commit job.

    This function:
    1. Loads the session
    2. Creates embeddings for all chunks
    3. Bulk inserts into OpenSearch

    Args:
        job: Job dictionary with job_id, session_id, embedding_model, index_name (optional)
    """
    job_id = job["job_id"]
    session_id = job["session_id"]
    embedding_model = job["embedding_model"]
    custom_index_name = job.get("index_name")  # May be None

    logger.info(f"Starting commit job {job_id} for session {session_id}")

    try:
        # Mark as running
        job = update_job_status(job, "running")
        save_job(job)

        # Load session
        session = load_session(session_id)
        chunks = session.chunks

        if not chunks:
            # No chunks to process
            job = update_job_status(
                job, "succeeded", progress=1.0, total=0, succeeded=0, failed=0
            )
            save_job(job)
            logger.info(f"Job {job_id} completed: no chunks to process")
            return

        total = len(chunks)
        job = update_job_status(job, "running", progress=0.0, total=total)
        save_job(job)

        # Get embedding provider
        provider = get_embedding_provider(embedding_model)

        # Get dimension from provider
        dimension = provider.dimension()

        # Determine index name
        if custom_index_name:
            index_name = custom_index_name
            # Check if index exists and validate dimension
            client = get_opensearch_client()
            if client.index_exists(index_name):
                existing_dim = get_index_dimension(index_name)
                if existing_dim != dimension:
                    raise OpenSearchDimensionMismatchError(
                        index_name=index_name,
                        expected_dim=dimension,
                        actual_dim=existing_dim,
                    )
                logger.info(f"Using existing index {index_name} with dimension {dimension}")
            else:
                logger.info(f"Creating new index {index_name} with dimension {dimension}")
        else:
            index_name = get_default_index_name(embedding_model)

        # Ensure index exists with correct dimension
        ensure_index(index_name, dimension)

        logger.info(f"Using index {index_name} with dimension {dimension}")

        # Extract chunk texts
        texts = []
        for chunk in chunks:
            chunk_text = session.current_text[chunk.start : chunk.end]
            texts.append(chunk_text)

        # Generate embeddings in batches
        batch_size = settings.OPENSEARCH_BULK_SIZE
        all_embeddings: List[List[float]] = []
        error_samples: List[Dict[str, Any]] = []
        failed_count = 0

        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i : i + batch_size]
            try:
                batch_embeddings = provider.embed_texts(batch_texts)
                all_embeddings.extend(batch_embeddings)
            except Exception as e:
                # Record error and fill with None
                logger.error(f"Embedding batch {i // batch_size} failed: {str(e)}")
                for j in range(len(batch_texts)):
                    all_embeddings.append(None)
                    failed_count += 1
                    if len(error_samples) < 5:
                        error_samples.append(
                            {
                                "chunk_index": i + j,
                                "error": str(e),
                            }
                        )

            # Update progress
            progress = min(0.5, (i + len(batch_texts)) / total * 0.5)
            job = update_job_status(job, "running", progress=progress)
            save_job(job)

        # Build bulk actions
        actions = []
        succeeded_count = 0

        for idx, chunk in enumerate(chunks):
            embedding = all_embeddings[idx] if idx < len(all_embeddings) else None

            if embedding is None:
                continue

            # Get chunk text
            chunk_text = texts[idx]

            # Get metadata
            metadata = session.chunk_metadata.get(
                chunk.chunk_id, ChunkMetadata()
            )

            # Build document
            doc = {
                "doc_id": session.doc_id,
                "session_id": session.session_id,
                "chunk_id": chunk.chunk_id,
                "page_no": chunk.page_no,
                "start": chunk.start,
                "end": chunk.end,
                "char_len": chunk.char_len,
                "text": chunk_text,
                "hash": chunk.hash,
                "vector": embedding,
                "metadata": metadata.model_dump(),
                "chunk_strategy": session.chunk_strategy.model_dump(),
                "extractor_version": session.extract_meta.extractor_version,
                "embedding": {
                    "model": embedding_model,
                    "dimension": dimension,
                    "provider": "langchain_openai",
                },
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }

            # Use hash as _id for idempotency
            action = {
                "_index": index_name,
                "_id": chunk.hash,
                "_source": doc,
            }
            actions.append(action)
            succeeded_count += 1

        # Bulk insert
        if actions:
            client = get_opensearch_client()

            # Process in batches
            for i in range(0, len(actions), batch_size):
                batch_actions = actions[i : i + batch_size]
                try:
                    result = client.bulk(batch_actions)
                    if result.get("errors"):
                        # Some items failed
                        for error in result.get("errors", [])[:5]:
                            if len(error_samples) < 5:
                                error_samples.append(
                                    {"bulk_error": str(error)}
                                )
                except Exception as e:
                    logger.error(f"Bulk insert batch {i // batch_size} failed: {str(e)}")
                    if len(error_samples) < 5:
                        error_samples.append(
                            {"batch_index": i // batch_size, "error": str(e)}
                        )

                # Update progress (50% to 100% for bulk insert)
                progress = 0.5 + (i + len(batch_actions)) / len(actions) * 0.5
                job = update_job_status(job, "running", progress=progress)
                save_job(job)

        # Complete job
        final_status = "succeeded" if failed_count == 0 else "failed"
        job = update_job_status(
            job,
            final_status,
            progress=1.0,
            total=total,
            succeeded=succeeded_count,
            failed=failed_count,
            error_samples=error_samples,
        )
        save_job(job)

        logger.info(
            f"Job {job_id} completed: {succeeded_count}/{total} succeeded, {failed_count} failed"
        )

    except Exception as e:
        logger.error(f"Job {job_id} failed with error: {str(e)}")
        job = update_job_status(
            job,
            "failed",
            error=str(e),
            error_samples=[{"error": str(e)}],
        )
        save_job(job)
