"""
ChunkSmith Hybrid - Search API
Text, vector, and hybrid search across indexed chunks
"""

import time
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from ..core.models import SearchHit, SearchRequest, SearchResponse
from ..core.runtime_state import get_embedding_models
from ..core.search_builders import build_hybrid_query, build_knn_query, build_text_query
from ..integrations.embeddings import get_embedding_provider
from ..integrations.opensearch_client import get_opensearch_client
from ..integrations.opensearch_index_manager import get_default_index_name

router = APIRouter(prefix="/api", tags=["search"])


def _extract_hits(raw_hits: List[Dict[str, Any]]) -> List[SearchHit]:
    """
    Extract SearchHit objects from OpenSearch response.

    Args:
        raw_hits: List of hits from OpenSearch response

    Returns:
        List of SearchHit objects
    """
    hits = []
    for rank, hit in enumerate(raw_hits, start=1):
        source = hit.get("_source", {})

        # Get text snippet (first 200 chars)
        text = source.get("text", "")
        text_snippet = text[:200] + "..." if len(text) > 200 else text

        hits.append(
            SearchHit(
                rank=rank,
                score=hit.get("_score", 0.0),
                doc_id=source.get("doc_id", ""),
                session_id=source.get("session_id", ""),
                chunk_id=source.get("chunk_id", ""),
                page_no=source.get("page_no", 0),
                start=source.get("start", 0),
                end=source.get("end", 0),
                char_len=source.get("char_len", 0),
                text_snippet=text_snippet,
                metadata=source.get("metadata"),
            )
        )

    return hits


def extract_model_from_index_name(index_name: str) -> str:
    """
    Extract model key from index name.
    
    Index format: chunksmith-chunks__<model_key>
    """
    if "__" in index_name:
        return index_name.split("__", 1)[1]
    return index_name


@router.post("/search", response_model=SearchResponse)
async def search_chunks(request: SearchRequest) -> SearchResponse:
    """
    Search indexed chunks.

    Modes:
    - text: BM25 text search
    - vector: kNN vector search (requires embedding_model or index_name)
    - hybrid: Combined text + vector search (requires embedding_model or index_name)

    When index_name is specified, the embedding_model is automatically determined from the index.

    Returns ranked results with snippets and metadata.
    """
    start_time = time.time()

    # Determine index_name and embedding_model
    index_name = request.index_name
    embedding_model = request.embedding_model
    
    if index_name:
        # When index_name is specified, derive model from it
        # The model key in index may be sanitized, but we need it for embedding provider
        # We'll use the model_key directly for embedding (provider handles mapping)
        model_key = extract_model_from_index_name(index_name)
        # Try to find matching model from available models
        available = get_embedding_models()
        for m in available:
            from ..integrations.opensearch_index_manager import sanitize_model_key
            if sanitize_model_key(m) == model_key:
                embedding_model = m
                break
        if not embedding_model:
            # Fallback: use the model_key as-is (may work for simple names)
            embedding_model = model_key
    else:
        # Legacy behavior: determine model and index
        if not embedding_model and request.mode in ("vector", "hybrid"):
            available = get_embedding_models()
            if available:
                embedding_model = available[0]
            else:
                raise HTTPException(400, "No embedding model available for vector/hybrid search")

        if request.mode == "text" and not embedding_model:
            available = get_embedding_models()
            embedding_model = available[0] if available else "default"

        # Get index name from model
        index_name = get_default_index_name(embedding_model)

    # Build query based on mode
    if request.mode == "text":
        query_body = build_text_query(
            query=request.query,
            top_k=request.top_k,
            filters=request.filters,
        )
    elif request.mode == "vector":
        # Get or generate vector
        if request.vector:
            vector = request.vector
        else:
            provider = get_embedding_provider(embedding_model)
            vectors = provider.embed_texts([request.query])
            vector = vectors[0] if vectors else []

        query_body = build_knn_query(
            vector=vector,
            top_k=request.top_k,
            filters=request.filters,
        )
    else:  # hybrid
        # Generate vector
        if request.vector:
            vector = request.vector
        else:
            provider = get_embedding_provider(embedding_model)
            vectors = provider.embed_texts([request.query])
            vector = vectors[0] if vectors else []

        query_body = build_hybrid_query(
            query=request.query,
            vector=vector,
            top_k=request.top_k,
            filters=request.filters,
        )

    # Execute search
    client = get_opensearch_client()
    response = client.search(index_name, query_body)

    # Extract results
    raw_hits = response.get("hits", {}).get("hits", [])
    hits = _extract_hits(raw_hits)

    # Calculate time
    took_ms = int((time.time() - start_time) * 1000)

    return SearchResponse(
        mode=request.mode,
        index_name=index_name,
        top_k=request.top_k,
        took_ms=took_ms,
        hits=hits,
    )
