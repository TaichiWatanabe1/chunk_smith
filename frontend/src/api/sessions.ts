/**
 * Sessions API
 */

import { request, uploadFile } from "./client";
import type {
  ChunkStrategy,
  SessionResponse,
  UpdateTextResponse,
  UpdateChunkStrategyResponse,
  CommitResponse,
  JSONLPreviewResponse,
} from "../types/dtos";

// Note: single-file session creation is deprecated in the frontend.
// Uploads are handled via the batch API (`frontend/src/api/batches.ts`).

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/sessions/${sessionId}`);
}

/**
 * Update the full text content
 */
export async function updateText(
  sessionId: string,
  version: number,
  currentText: string,
): Promise<UpdateTextResponse> {
  return request<UpdateTextResponse>(`/api/sessions/${sessionId}/text`, {
    method: "PUT",
    body: {
      version,
      current_text: currentText,
    },
  });
}

/**
 * Update the chunk strategy
 */
export async function updateChunkStrategy(
  sessionId: string,
  version: number,
  strategy: ChunkStrategy,
): Promise<UpdateChunkStrategyResponse> {
  return request<UpdateChunkStrategyResponse>(
    `/api/sessions/${sessionId}/chunk_strategy`,
    {
      method: "PUT",
      body: {
        version,
        chunk_strategy: strategy,
      },
    },
  );
}

/**
 * Commit session to OpenSearch
 */
export async function commit(
  sessionId: string,
  embeddingModel: string,
  indexName?: string,
): Promise<CommitResponse> {
  return request<CommitResponse>(`/api/sessions/${sessionId}/commit`, {
    method: "POST",
    body: {
      embedding_model: embeddingModel,
      index_name: indexName,
    },
  });
}

/**
 * Preview JSONL file before import
 */
export async function previewJsonl(
  file: File,
  docId?: string,
): Promise<JSONLPreviewResponse> {
  const extraFields: Record<string, string> = {};
  if (docId) {
    extraFields.doc_id = docId;
  }
  return uploadFile<JSONLPreviewResponse>(
    "/api/sessions/jsonl/preview",
    file,
    extraFields,
  );
}

/**
 * Create a session from JSONL file
 */
// Deprecated: JSONL import is routed through batch creation in the frontend.
// Keep previewJsonl for showing previews; actual import uses `createBatch`.
