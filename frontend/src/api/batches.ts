/**
 * ChunkSmith Frontend - Batch API
 * API client for batch operations
 */

import { request, ApiError, uploadForm } from "./client";
import type {
  BatchResponse,
  BatchListResponse,
  BatchCommitRequest,
  BatchCommitResponse,
} from "../types/dtos";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/**
 * Create a new batch by uploading multiple PDFs
 */
export async function createBatch(
  files: File[],
  batchName?: string,
): Promise<BatchResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  if (batchName) {
    formData.append("batch_name", batchName);
  }

  return uploadForm<BatchResponse>(`/api/batches`, formData);
}

/**
 * Get all batches
 */
export async function getBatches(): Promise<BatchListResponse> {
  return request<BatchListResponse>("/api/batches");
}

/**
 * Get a batch by ID
 */
export async function getBatch(batchId: string): Promise<BatchResponse> {
  return request<BatchResponse>(`/api/batches/${batchId}`);
}

/**
 * Delete a batch
 */
export async function deleteBatch(
  batchId: string,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/api/batches/${batchId}`, {
    method: "DELETE",
  });
}

/**
 * Add files to an existing batch
 */
export async function addFilesToBatch(
  batchId: string,
  files: File[],
): Promise<BatchResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  return uploadForm<BatchResponse>(`/api/batches/${batchId}/files`, formData);
}

/**
 * Commit all ready sessions in a batch
 */
export async function commitBatch(
  batchId: string,
  req: BatchCommitRequest,
): Promise<BatchCommitResponse> {
  return request<BatchCommitResponse>(`/api/batches/${batchId}/commit`, {
    method: "POST",
    body: req,
  });
}
