/**
 * Embedding API
 */

import { request, ApiError } from "./client";
import type {
  EmbeddingModelsResponse,
  EmbeddingModelsWithDimensionsResponse,
  EmbeddingModelInfo,
} from "../types/dtos";

// Fallback models if API is not available (Bifrost format)
const FALLBACK_MODELS = [
  "openai/text-embedding-3-large",
  "openai/text-embedding-3-small",
];

/**
 * Get list of available embedding models
 */
export async function getEmbeddingModels(): Promise<string[]> {
  try {
    const response = await request<EmbeddingModelsResponse>(
      "/api/embedding/models",
    );
    return response.models.length > 0 ? response.models : FALLBACK_MODELS;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // Endpoint not available, use fallback
      return FALLBACK_MODELS;
    }
    throw error;
  }
}

/**
 * Get list of available embedding models with their dimensions
 */
export async function getEmbeddingModelsWithDimensions(): Promise<
  EmbeddingModelInfo[]
> {
  try {
    const response = await request<EmbeddingModelsWithDimensionsResponse>(
      "/api/embedding/models/dimensions",
    );
    return response.models;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // Endpoint not available, return empty
      return [];
    }
    throw error;
  }
}
