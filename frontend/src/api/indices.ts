/**
 * Indices API client
 * OpenSearch index management
 */

import { request } from "./client";
import type {
  IndexDeleteResponse,
  IndexInfo,
  IndexListResponse,
} from "../types/dtos";

/**
 * Get all OpenSearch indices
 */
export async function listIndices(): Promise<IndexListResponse> {
  return request<IndexListResponse>("/api/indices");
}

/**
 * Get information about a specific index
 */
export async function getIndex(indexName: string): Promise<IndexInfo> {
  return request<IndexInfo>(`/api/indices/${encodeURIComponent(indexName)}`);
}

/**
 * Delete an OpenSearch index
 */
export async function deleteIndex(
  indexName: string,
): Promise<IndexDeleteResponse> {
  return request<IndexDeleteResponse>(
    `/api/indices/${encodeURIComponent(indexName)}`,
    { method: "DELETE" },
  );
}
