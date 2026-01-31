"""ChunkSmith Hybrid - OpenAI Model Discovery (Bifrost対応)

起動時に:
1. /v1/models でモデル一覧を取得
2. "embedding" を含むモデルに対して実際にリクエストを送信
3. 成功したモデルのみを利用可能リストに登録
"""

from __future__ import annotations

from typing import List

from openai import OpenAI

from ..core.config import settings
from ..core.logging import get_logger
from ..core.runtime_state import set_embedding_models

logger = get_logger(__name__)


def _get_api_key() -> str:
    """API keyを取得。ローカルサーバーの場合はダミー値を返す。"""
    if settings.OPENAI_API_KEY:
        return settings.OPENAI_API_KEY
    # Bifrost等のローカルサーバーはキー不要だがSDKは必須なのでダミー
    return "unused"


def _get_client() -> OpenAI:
    """OpenAI クライアントを作成。"""
    return OpenAI(
        base_url=settings.OPENAI_BASE_URL,
        api_key=_get_api_key(),
    )


def _test_embedding(client: OpenAI, model: str) -> bool:
    """モデルに対して embedding リクエストを送り、成功したら True。"""
    try:
        client.embeddings.create(model=model, input=["test"])
        return True
    except Exception as e:
        logger.debug(f"Embedding test failed for {model}: {e}")
        return False


def initialize_embedding_models() -> None:
    """起動時に利用可能な embedding モデルを検出して登録する。

    1. /v1/models からモデル一覧を取得
    2. "embedding" を含むモデルに対して実際にリクエスト
    3. 成功したモデルのみ登録

    Raises:
        RuntimeError: モデル一覧取得に失敗、または利用可能なモデルがない場合
    """
    client = _get_client()

    # 1) モデル一覧を取得
    try:
        response = client.models.list()
        all_models = [m.id for m in response.data]
        logger.info(f"Found {len(all_models)} models from endpoint")
    except Exception as e:
        raise RuntimeError(f"Failed to list models from {settings.OPENAI_BASE_URL}: {e}")

    # 2) embedding候補を抽出
    embedding_candidates = [m for m in all_models if "embedding" in m.lower()]
    if not embedding_candidates:
        raise RuntimeError(
            f"No embedding models found in {len(all_models)} models. "
            f"Models: {all_models[:10]}..."
        )

    logger.info(f"Testing {len(embedding_candidates)} embedding candidates: {embedding_candidates}")

    # 3) 実際にリクエストして成功したモデルのみ登録
    available = [m for m in embedding_candidates if _test_embedding(client, m)]

    if not available:
        raise RuntimeError(
            f"All embedding candidates failed connectivity test: {embedding_candidates}"
        )

    set_embedding_models(available, source="verified")
    logger.info(f"Registered {len(available)} embedding models: {available}")
