"""
ChunkSmith Hybrid - Embedding API
List available embedding models
"""

from fastapi import APIRouter

from ..core.models import (
    EmbeddingModelsResponse,
    EmbeddingModelsWithDimensionsResponse,
    EmbeddingModelInfo,
)
from ..core.runtime_state import get_embedding_models as get_runtime_embedding_models
from ..integrations.embeddings import get_embedding_provider

router = APIRouter(prefix="/api/embedding", tags=["embedding"])


@router.get("/models", response_model=EmbeddingModelsResponse)
async def get_embedding_models() -> EmbeddingModelsResponse:
    """
    Get list of available embedding models.

    Returns models discovered at app startup.
    """
    return EmbeddingModelsResponse(models=get_runtime_embedding_models())


@router.get("/models/dimensions", response_model=EmbeddingModelsWithDimensionsResponse)
async def get_embedding_models_with_dimensions() -> EmbeddingModelsWithDimensionsResponse:
    """
    Get list of available embedding models with their dimensions.

    Note: This may make API calls to determine dimensions for models
    that haven't been used yet.
    """
    models = get_runtime_embedding_models()
    result = []

    for model in models:
        try:
            provider = get_embedding_provider(model)
            dimension = provider.dimension()
            result.append(EmbeddingModelInfo(model=model, dimension=dimension))
        except Exception:
            # Skip models that fail to get dimension
            pass

    return EmbeddingModelsWithDimensionsResponse(models=result)
