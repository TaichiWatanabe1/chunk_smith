"""
ChunkSmith Hybrid - Hashing Utilities
SHA256 hashing for pages and chunks
"""

import hashlib


def sha256_text(text: str) -> str:
    """
    Compute SHA256 hash of text.

    Args:
        text: Input text

    Returns:
        Hex-encoded SHA256 hash
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def hash_page(doc_id: str, page_no: int, page_text: str) -> str:
    """
    Compute hash for a page.

    Combines doc_id, page_no, and page_text for unique identification.

    Args:
        doc_id: Document identifier
        page_no: Page number
        page_text: Page text content

    Returns:
        Hex-encoded hash
    """
    content = f"{doc_id}:page:{page_no}:{page_text}"
    return sha256_text(content)


def hash_chunk(doc_id: str, chunk_id: str, chunk_text: str) -> str:
    """
    Compute hash for a chunk.

    Combines doc_id, chunk_id, and chunk_text for unique identification.
    This hash is used as OpenSearch _id for re-commit resilience.

    Args:
        doc_id: Document identifier
        chunk_id: Chunk identifier (e.g., P001-C001)
        chunk_text: Chunk text content

    Returns:
        Hex-encoded hash
    """
    content = f"{doc_id}:chunk:{chunk_id}:{chunk_text}"
    return sha256_text(content)
