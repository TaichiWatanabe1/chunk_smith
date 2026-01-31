"""Tests for embedding API handlers."""

import asyncio

from app.core.runtime_state import set_embedding_models


def test_get_embedding_models_returns_list():
    set_embedding_models(["text-embedding-3-small", "text-embedding-3-large"], source="test")

    from app.api.embedding import get_embedding_models

    resp = asyncio.run(get_embedding_models())
    assert resp.models == ["text-embedding-3-small", "text-embedding-3-large"]
