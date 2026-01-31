"""
ChunkSmith Hybrid - Indices API
OpenSearch index management
"""

from typing import Optional

from fastapi import APIRouter

from ..core.errors import IndexNotFoundError, OpenSearchError
from ..core.models import IndexDeleteResponse, IndexInfo, IndexListResponse
from ..integrations.opensearch_client import get_opensearch_client

router = APIRouter(prefix="/api/indices", tags=["indices"])


def _parse_size(size_str: str) -> int:
    """Parse size string (e.g., '1.2mb', '500kb') to bytes."""
    size_str = size_str.lower().strip()
    multipliers = {
        "b": 1,
        "kb": 1024,
        "mb": 1024 * 1024,
        "gb": 1024 * 1024 * 1024,
        "tb": 1024 * 1024 * 1024 * 1024,
    }

    for suffix, mult in multipliers.items():
        if size_str.endswith(suffix):
            try:
                return int(float(size_str[: -len(suffix)]) * mult)
            except ValueError:
                return 0
    return 0


def _format_size(size_bytes: int) -> str:
    """Format bytes to human-readable string."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} PB"


@router.get("", response_model=IndexListResponse)
async def list_indices() -> IndexListResponse:
    """
    List all OpenSearch indices with stats.

    Returns information about each index including:
    - Document count
    - Storage size
    - Vector dimension (if applicable)
    - Health status
    """
    client = get_opensearch_client()

    try:
        # Refresh all chunksmith indices to get accurate doc counts
        try:
            client._client.indices.refresh(index="chunksmith-*")
        except Exception:
            pass  # Ignore if no indices exist yet

        # Get all indices with stats
        indices_response = client._client.cat.indices(format="json")

        indices = []
        for idx in indices_response:
            index_name = idx.get("index", "")

            # Skip system indices
            if index_name.startswith("."):
                continue

            # Get dimension from mapping if it's a vector index
            dimension: Optional[int] = None
            try:
                mapping = client.get_mapping(index_name)
                if index_name in mapping:
                    props = mapping[index_name].get("mappings", {}).get("properties", {})
                    if "vector" in props:
                        dimension = props["vector"].get("dimension")
            except Exception:
                pass

            size_str = idx.get("store.size", "0b")
            size_bytes = _parse_size(size_str)

            indices.append(
                IndexInfo(
                    index_name=index_name,
                    doc_count=int(idx.get("docs.count", 0) or 0),
                    size_bytes=size_bytes,
                    size_human=_format_size(size_bytes),
                    dimension=dimension,
                    health=idx.get("health", "unknown"),
                    status=idx.get("status", "unknown"),
                )
            )

        # Sort by name
        indices.sort(key=lambda x: x.index_name)

        return IndexListResponse(indices=indices)

    except Exception as e:
        raise OpenSearchError(f"Failed to list indices: {str(e)}")


@router.get("/{index_name}", response_model=IndexInfo)
async def get_index(index_name: str) -> IndexInfo:
    """
    Get information about a specific index.
    """
    client = get_opensearch_client()

    try:
        # Check if index exists
        if not client.index_exists(index_name):
            raise IndexNotFoundError(index_name)

        # Get index stats
        stats = client._client.cat.indices(index=index_name, format="json")
        if not stats:
            raise IndexNotFoundError(index_name)

        idx = stats[0]

        # Get dimension from mapping
        dimension: Optional[int] = None
        try:
            mapping = client.get_mapping(index_name)
            if index_name in mapping:
                props = mapping[index_name].get("mappings", {}).get("properties", {})
                if "vector" in props:
                    dimension = props["vector"].get("dimension")
        except Exception:
            pass

        size_str = idx.get("store.size", "0b")
        size_bytes = _parse_size(size_str)

        return IndexInfo(
            index_name=index_name,
            doc_count=int(idx.get("docs.count", 0) or 0),
            size_bytes=size_bytes,
            size_human=_format_size(size_bytes),
            dimension=dimension,
            health=idx.get("health", "unknown"),
            status=idx.get("status", "unknown"),
        )

    except IndexNotFoundError:
        raise
    except Exception as e:
        raise OpenSearchError(f"Failed to get index info: {str(e)}")


@router.delete("/{index_name}", response_model=IndexDeleteResponse)
async def delete_index(index_name: str) -> IndexDeleteResponse:
    """
    Delete an OpenSearch index.

    Warning: This operation is irreversible. All documents in the index will be lost.
    """
    client = get_opensearch_client()

    try:
        # Check if index exists
        if not client.index_exists(index_name):
            return IndexDeleteResponse(
                index_name=index_name,
                deleted=False,
                message=f"Index '{index_name}' not found",
            )

        # Delete the index
        client.delete_index(index_name)

        return IndexDeleteResponse(
            index_name=index_name,
            deleted=True,
            message=f"Index '{index_name}' deleted successfully",
        )

    except Exception as e:
        raise OpenSearchError(f"Failed to delete index: {str(e)}")
