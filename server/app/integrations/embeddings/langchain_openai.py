"""ChunkSmith Hybrid - LangChain OpenAI Embedding Provider

LangChain OpenAIEmbeddings を使用した embedding 生成。
Bifrost等のOpenAI互換エンドポイントに対応。
"""

from __future__ import annotations

from typing import List, Optional

from langchain_openai import OpenAIEmbeddings

from ...core.config import settings
from ...core.errors import EmbeddingFailedError
from ...core.logging import get_logger
from .base import EmbeddingProvider

logger = get_logger(__name__)


def _get_api_key() -> str:
    """API keyを取得。ローカルサーバーの場合はダミー値を返す。"""
    if settings.OPENAI_API_KEY:
        return settings.OPENAI_API_KEY
    return "unused"


class LangChainOpenAIEmbeddingProvider(EmbeddingProvider):
    """LangChain OpenAIEmbeddings を使用した embedding provider。"""

    def __init__(self, model: str):
        self._model = model
        self._dimension: Optional[int] = None
        logger.info(f"Creating LangChain embedding provider for model: {model}")
        self._embeddings = OpenAIEmbeddings(
            model=model,
            openai_api_key=_get_api_key(),
            openai_api_base=settings.OPENAI_BASE_URL,
        )

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        try:
            vectors = self._embeddings.embed_documents(texts)
            if self._dimension is None and vectors:
                self._dimension = len(vectors[0])
            return vectors
        except Exception as e:
            raise EmbeddingFailedError(f"Embedding failed: {e}")

    def dimension(self) -> int:
        if self._dimension is None:
            try:
                vector = self._embeddings.embed_query("test")
                self._dimension = len(vector)
            except Exception as e:
                raise EmbeddingFailedError(f"Failed to get dimension: {e}")
        return self._dimension

    def name(self) -> str:
        return f"langchain_openai:{self._model}"


def get_embedding_provider(model: str) -> EmbeddingProvider:
    """指定モデルの embedding provider を作成。"""
    return LangChainOpenAIEmbeddingProvider(model)
