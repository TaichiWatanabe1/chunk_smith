"""
ChunkSmith Hybrid - Embedding Provider Base
Abstract base class for embedding providers
"""

from abc import ABC, abstractmethod
from typing import List


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    @abstractmethod
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed

        Returns:
            List of embedding vectors
        """
        pass

    @abstractmethod
    def dimension(self) -> int:
        """
        Get the dimension of the embedding vectors.

        Returns:
            Embedding dimension
        """
        pass

    @abstractmethod
    def name(self) -> str:
        """
        Get the name/identifier of this provider.

        Returns:
            Provider name
        """
        pass
