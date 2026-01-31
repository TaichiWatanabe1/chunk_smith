"""
ChunkSmith Hybrid - Search Query Builders
Build OpenSearch queries for text/vector/hybrid search
"""

from typing import Any, Dict, List, Optional


def build_text_query(
    query: str,
    top_k: int,
    filters: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Build a text (BM25) search query.

    Args:
        query: Search query text
        top_k: Number of results to return
        filters: Optional filters (e.g., {"doc_id": "xxx"})

    Returns:
        OpenSearch query body
    """
    must_clauses = [
        {
            "match": {
                "text": {
                    "query": query,
                    "operator": "or",
                }
            }
        }
    ]

    filter_clauses = _build_filter_clauses(filters)

    body: Dict[str, Any] = {
        "size": top_k,
        "query": {
            "bool": {
                "must": must_clauses,
            }
        },
    }

    if filter_clauses:
        body["query"]["bool"]["filter"] = filter_clauses

    return body


def build_knn_query(
    vector: List[float],
    top_k: int,
    filters: Optional[Dict[str, str]] = None,
    k: int = 100,
    num_candidates: int = 500,
) -> Dict[str, Any]:
    """
    Build a vector (kNN) search query.

    Args:
        vector: Query embedding vector
        top_k: Number of results to return
        filters: Optional filters
        k: Number of nearest neighbors to consider
        num_candidates: Number of candidates for HNSW

    Returns:
        OpenSearch query body
    """
    filter_clauses = _build_filter_clauses(filters)

    # OpenSearch knn query format
    knn_query: Dict[str, Any] = {
        "vector": vector,
        "k": min(k, top_k * 5),  # k should be larger than top_k
    }

    if filter_clauses:
        knn_query["filter"] = {"bool": {"filter": filter_clauses}}

    body: Dict[str, Any] = {
        "size": top_k,
        "query": {
            "knn": {
                "vector": knn_query
            }
        },
    }

    return body


def build_hybrid_query(
    query: str,
    vector: List[float],
    top_k: int,
    filters: Optional[Dict[str, str]] = None,
    k: int = 100,
    num_candidates: int = 500,
) -> Dict[str, Any]:
    """
    Build a hybrid search query (text + vector combined).

    Uses bool.should to combine BM25 match and kNN queries.
    No RRF - just uses OpenSearch's native scoring.

    Args:
        query: Search query text
        vector: Query embedding vector
        top_k: Number of results to return
        filters: Optional filters
        k: Number of nearest neighbors for kNN
        num_candidates: Number of candidates for HNSW

    Returns:
        OpenSearch query body
    """
    filter_clauses = _build_filter_clauses(filters)

    # Text match clause
    text_clause = {
        "match": {
            "text": {
                "query": query,
                "operator": "or",
            }
        }
    }

    # kNN clause
    knn_clause: Dict[str, Any] = {
        "knn": {
            "vector": {
                "vector": vector,
                "k": min(k, top_k * 5),
            }
        }
    }

    # Combine with bool.should
    body: Dict[str, Any] = {
        "size": top_k,
        "query": {
            "bool": {
                "should": [text_clause, knn_clause],
                "minimum_should_match": 1,
            }
        },
    }

    if filter_clauses:
        body["query"]["bool"]["filter"] = filter_clauses

    return body


def _build_filter_clauses(
    filters: Optional[Dict[str, str]],
) -> List[Dict[str, Any]]:
    """
    Build filter clauses from filters dict.

    Args:
        filters: Dictionary of field -> value filters

    Returns:
        List of term filter clauses
    """
    if not filters:
        return []

    clauses = []
    for field, value in filters.items():
        clauses.append({"term": {field: value}})

    return clauses
