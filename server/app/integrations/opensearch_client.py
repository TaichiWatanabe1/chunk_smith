"""
ChunkSmith Hybrid - OpenSearch Client
Low-level OpenSearch operations
"""

from typing import Any, Dict, List, Optional

from opensearchpy import OpenSearch

from ..core.config import settings
from ..core.errors import OpenSearchError
from ..core.logging import get_logger

logger = get_logger(__name__)


class OpenSearchClient:
    """OpenSearch client wrapper."""

    _instance: Optional["OpenSearchClient"] = None

    def __init__(self):
        """Initialize OpenSearch client."""
        # Parse host URL
        host = settings.OPENSEARCH_HOST
        if host.startswith("http://"):
            host = host[7:]
            use_ssl = False
        elif host.startswith("https://"):
            host = host[8:]
            use_ssl = True
        else:
            use_ssl = False

        # Handle port in host
        if ":" in host:
            host_part, port_part = host.rsplit(":", 1)
            port = int(port_part)
            host = host_part
        else:
            port = 9200

        # Build auth if provided
        http_auth = None
        if settings.OPENSEARCH_USERNAME and settings.OPENSEARCH_PASSWORD:
            http_auth = (settings.OPENSEARCH_USERNAME, settings.OPENSEARCH_PASSWORD)

        self._client = OpenSearch(
            hosts=[{"host": host, "port": port}],
            http_auth=http_auth,
            use_ssl=use_ssl,
            verify_certs=settings.OPENSEARCH_VERIFY_SSL,
            ssl_show_warn=False,
        )

    @classmethod
    def get_instance(cls) -> "OpenSearchClient":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def search(self, index_name: str, body: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a search query.

        Args:
            index_name: Index to search
            body: Search query body

        Returns:
            Raw OpenSearch response

        Raises:
            OpenSearchError: If search fails
        """
        try:
            return self._client.search(index=index_name, body=body)
        except Exception as e:
            logger.error(f"Search failed on {index_name}: {str(e)}")
            raise OpenSearchError(f"Search failed: {str(e)}")

    def bulk(self, actions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Execute bulk operations.

        Args:
            actions: List of bulk action documents

        Returns:
            Raw OpenSearch response

        Raises:
            OpenSearchError: If bulk operation fails
        """
        try:
            from opensearchpy.helpers import bulk as os_bulk

            # Add _op_type for index operation if not present
            for action in actions:
                if "_op_type" not in action:
                    action["_op_type"] = "index"

            logger.info(f"Bulk indexing {len(actions)} documents")
            success, errors = os_bulk(
                self._client,
                actions,
                raise_on_error=False,
                raise_on_exception=False,
                refresh=True,  # Make documents immediately searchable
            )
            logger.info(f"Bulk result: success={success}, errors={len(errors) if errors else 0}")
            if errors:
                logger.error(f"Bulk errors: {errors[:3]}")
            return {"success": success, "errors": errors}
        except Exception as e:
            logger.error(f"Bulk operation failed: {str(e)}")
            raise OpenSearchError(f"Bulk operation failed: {str(e)}")

    def index_exists(self, index_name: str) -> bool:
        """
        Check if an index exists.

        Args:
            index_name: Index name to check

        Returns:
            True if index exists
        """
        try:
            return self._client.indices.exists(index=index_name)
        except Exception as e:
            logger.error(f"Index exists check failed for {index_name}: {str(e)}")
            raise OpenSearchError(f"Failed to check index: {str(e)}")

    def create_index(self, index_name: str, body: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create an index.

        Args:
            index_name: Index name to create
            body: Index settings and mappings

        Returns:
            Raw OpenSearch response

        Raises:
            OpenSearchError: If creation fails
        """
        try:
            return self._client.indices.create(index=index_name, body=body)
        except Exception as e:
            logger.error(f"Index creation failed for {index_name}: {str(e)}")
            raise OpenSearchError(f"Failed to create index: {str(e)}")

    def get_mapping(self, index_name: str) -> Dict[str, Any]:
        """
        Get index mapping.

        Args:
            index_name: Index name

        Returns:
            Mapping dictionary

        Raises:
            OpenSearchError: If operation fails
        """
        try:
            return self._client.indices.get_mapping(index=index_name)
        except Exception as e:
            logger.error(f"Get mapping failed for {index_name}: {str(e)}")
            raise OpenSearchError(f"Failed to get mapping: {str(e)}")

    def delete_index(self, index_name: str) -> Dict[str, Any]:
        """
        Delete an index.

        Args:
            index_name: Index name to delete

        Returns:
            Raw OpenSearch response

        Raises:
            OpenSearchError: If deletion fails
        """
        try:
            return self._client.indices.delete(index=index_name)
        except Exception as e:
            logger.error(f"Index deletion failed for {index_name}: {str(e)}")
            raise OpenSearchError(f"Failed to delete index: {str(e)}")

    def health(self) -> Dict[str, Any]:
        """
        Get cluster health.

        Returns:
            Cluster health response
        """
        try:
            return self._client.cluster.health()
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            raise OpenSearchError(f"Health check failed: {str(e)}")


def get_opensearch_client() -> OpenSearchClient:
    """Get OpenSearch client singleton."""
    return OpenSearchClient.get_instance()
