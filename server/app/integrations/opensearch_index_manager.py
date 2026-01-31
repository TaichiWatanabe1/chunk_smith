"""
ChunkSmith Hybrid - OpenSearch Index Manager
Manage model-specific indices with proper dimension handling
"""

import re
from typing import Any, Dict

from ..core.config import settings
from ..core.errors import OpenSearchDimensionMismatchError, OpenSearchError
from ..core.logging import get_logger
from .opensearch_client import get_opensearch_client

logger = get_logger(__name__)


def sanitize_model_key(model: str) -> str:
    """
    Sanitize model name for use in index name.

    Replaces non-alphanumeric characters with underscores.

    Args:
        model: Model name (e.g., "text-embedding-3-large")

    Returns:
        Sanitized key (e.g., "text_embedding_3_large")
    """
    # Replace any non-alphanumeric character with underscore
    sanitized = re.sub(r"[^a-zA-Z0-9]", "_", model)
    # Remove consecutive underscores
    sanitized = re.sub(r"_+", "_", sanitized)
    # Remove leading/trailing underscores
    sanitized = sanitized.strip("_")
    # Lowercase
    return sanitized.lower()


def get_index_name(base_index: str, model: str) -> str:
    """
    Get full index name for a specific model.

    Args:
        base_index: Base index name (e.g., "chunksmith-chunks")
        model: Model name (e.g., "text-embedding-3-large")

    Returns:
        Full index name (e.g., "chunksmith-chunks__text_embedding_3_large")
    """
    model_key = sanitize_model_key(model)
    return f"{base_index}__{model_key}"


def get_index_mapping_template(dimension: int) -> Dict[str, Any]:
    """
    Get the index mapping template with specified dimension.

    Args:
        dimension: Vector dimension

    Returns:
        OpenSearch index mapping
    """
    return {
        "settings": {
            "index": {
                "knn": True,
                "knn.algo_param.ef_search": 100,
            },
            "number_of_shards": 1,
            "number_of_replicas": 0,
        },
        "mappings": {
            "properties": {
                # Document identifiers
                "doc_id": {"type": "keyword"},
                "session_id": {"type": "keyword"},
                "chunk_id": {"type": "keyword"},
                # Position information
                "page_no": {"type": "integer"},
                "start": {"type": "integer"},
                "end": {"type": "integer"},
                "char_len": {"type": "integer"},
                # Content
                "text": {"type": "text", "analyzer": "standard"},
                "hash": {"type": "keyword"},
                # Vector embedding
                "vector": {
                    "type": "knn_vector",
                    "dimension": dimension,
                    "method": {
                        "name": "hnsw",
                        "space_type": "cosinesimil",
                        "engine": "nmslib",
                        "parameters": {
                            "ef_construction": 128,
                            "m": 24,
                        },
                    },
                },
                # Metadata
                "metadata": {
                    "type": "object",
                    "properties": {
                        "content_type": {"type": "keyword"},
                        "heading_path": {"type": "text"},
                        "note": {"type": "text"},
                        "quality_flag": {"type": "keyword"},
                        "custom": {"type": "object", "enabled": True},
                    },
                },
                # Strategy and version info
                "chunk_strategy": {
                    "type": "object",
                    "properties": {
                        "chunk_size": {"type": "integer"},
                        "overlap": {"type": "integer"},
                        "split_mode": {"type": "keyword"},
                        "normalize": {"type": "boolean"},
                    },
                },
                "extractor_version": {"type": "keyword"},
                # Embedding metadata
                "embedding": {
                    "type": "object",
                    "properties": {
                        "model": {"type": "keyword"},
                        "dimension": {"type": "integer"},
                        "provider": {"type": "keyword"},
                    },
                },
                # Timestamps
                "created_at": {"type": "date"},
                "updated_at": {"type": "date"},
            }
        },
    }


def get_index_dimension(index_name: str) -> int:
    """
    Get the vector dimension from an existing index.

    Args:
        index_name: Index name

    Returns:
        Vector dimension

    Raises:
        OpenSearchError: If dimension cannot be determined
    """
    client = get_opensearch_client()
    mapping = client.get_mapping(index_name)

    try:
        # Navigate to vector field dimension
        props = mapping[index_name]["mappings"]["properties"]
        dimension = props["vector"]["dimension"]
        return int(dimension)
    except (KeyError, TypeError) as e:
        raise OpenSearchError(
            f"Could not determine dimension for index {index_name}: {str(e)}"
        )


def ensure_index(index_name: str, dimension: int) -> None:
    """
    Ensure index exists with correct dimension.

    If index doesn't exist, creates it with the specified dimension.
    If index exists, verifies dimension matches.

    Args:
        index_name: Index name
        dimension: Required vector dimension

    Raises:
        OpenSearchDimensionMismatchError: If existing index has different dimension
        OpenSearchError: If index operations fail
    """
    client = get_opensearch_client()

    if not client.index_exists(index_name):
        # Create new index
        logger.info(f"Creating index {index_name} with dimension {dimension}")
        mapping = get_index_mapping_template(dimension)
        client.create_index(index_name, mapping)
        logger.info(f"Index {index_name} created successfully")
    else:
        # Verify dimension matches
        existing_dim = get_index_dimension(index_name)
        if existing_dim != dimension:
            raise OpenSearchDimensionMismatchError(
                index_name=index_name,
                expected_dim=dimension,
                actual_dim=existing_dim,
            )
        logger.debug(f"Index {index_name} exists with matching dimension {dimension}")


def get_default_index_name(model: str) -> str:
    """
    Get the default index name for a model.

    Uses the base index from settings.

    Args:
        model: Model name

    Returns:
        Full index name
    """
    return get_index_name(settings.OPENSEARCH_BASE_INDEX, model)
