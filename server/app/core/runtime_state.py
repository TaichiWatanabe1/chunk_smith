"""ChunkSmith Hybrid - Runtime State

起動後に変化するランタイム状態を管理。
"""

from __future__ import annotations

from threading import Lock
from typing import List


_embedding_models: List[str] = []
_lock = Lock()


def set_embedding_models(models: List[str], source: str) -> None:
    """利用可能な embedding モデルを設定。"""
    global _embedding_models
    with _lock:
        _embedding_models = list(models)


def get_embedding_models() -> List[str]:
    """利用可能な embedding モデル一覧を取得。"""
    with _lock:
        return list(_embedding_models)
