/**
 * Chunks API
 */

import { request } from "./client";
import type { ChunkDetailResponse, ChunkMetadata } from "../types/dtos";

/**
 * Get detailed information about a specific chunk
 */
export async function getChunkDetail(
  sessionId: string,
  chunkId: string,
): Promise<ChunkDetailResponse> {
  return request<ChunkDetailResponse>(
    `/api/sessions/${sessionId}/chunks/${chunkId}`,
  );
}

/**
 * Update metadata for a specific chunk
 */
export async function updateChunkMetadata(
  sessionId: string,
  chunkId: string,
  metadata: ChunkMetadata,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/api/sessions/${sessionId}/chunks/${chunkId}/metadata`,
    {
      method: "PUT",
      body: metadata,
    },
  );
}
