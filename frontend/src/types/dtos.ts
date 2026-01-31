/**
 * ChunkSmith Frontend - DTO Types
 * Matches server-side models
 */

// ==================== Core Types ====================

export interface ChunkStrategy {
  chunk_size: number;
  overlap: number;
  split_mode: "chars" | "paragraph" | "heading";
  normalize: boolean;
}

export interface PageSpan {
  page_no: number;
  start: number;
  end: number;
  char_len: number;
  hash: string;
}

export interface ChildChunk {
  chunk_id: string;
  page_no: number;
  start: number;
  end: number;
  char_len: number;
  hash: string;
  warnings: string[];
}

export interface ChunkMetadata {
  content_type: "body" | "table" | "bullets" | "caption" | "other";
  heading_path: string;
  note: string;
  quality_flag: "good" | "suspect" | "broken";
  custom?: Record<string, unknown>;
}

export interface RawPage {
  page_no: number;
  text: string;
}

export interface ExtractMeta {
  extractor_name: string;
  extractor_version: string;
  page_count: number;
  warnings: string[];
  created_at: string;
}

// ==================== API Responses ====================

export interface SessionResponse {
  session_id: string;
  doc_id: string;
  source_type?: "pdf" | "jsonl";
  extract_meta: ExtractMeta;
  base_pages: RawPage[];
  current_pages: RawPage[];
  current_text: string;
  page_map: PageSpan[];
  chunk_strategy: ChunkStrategy;
  chunks: ChildChunk[];
  chunk_metadata: Record<string, ChunkMetadata>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateTextResponse {
  version: number;
  current_text: string;
  page_map: PageSpan[];
  chunks: ChildChunk[];
}

export interface UpdateChunkStrategyResponse {
  chunk_strategy: ChunkStrategy;
  page_map: PageSpan[];
  chunks: ChildChunk[];
}

export interface ChunkDetailResponse {
  doc_id: string;
  session_id: string;
  chunk_id: string;
  page_no: number;
  start: number;
  end: number;
  char_len: number;
  text: string;
  extractor_version: string;
  chunk_strategy: ChunkStrategy;
  hash: string;
  warnings: string[];
  metadata: ChunkMetadata;
}

// ==================== Search Types ====================

export interface SearchRequest {
  query: string;
  mode: "text" | "vector" | "hybrid";
  top_k?: number;
  filters?: Record<string, string>;
  embedding_model?: string;
  vector?: number[];
  index_name?: string;
}

export interface SearchHit {
  rank: number;
  score: number;
  doc_id: string;
  session_id: string;
  chunk_id: string;
  page_no: number;
  start: number;
  end: number;
  char_len: number;
  text_snippet: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  mode: string;
  index_name: string;
  top_k: number;
  took_ms: number;
  hits: SearchHit[];
}

// ==================== Commit / Job Types ====================

export interface CommitRequest {
  embedding_model: string;
  index_name?: string;
}

export interface CommitResponse {
  job_id: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  total: number;
  succeeded: number;
  failed: number;
  error_samples: Array<Record<string, unknown>>;
}

// ==================== Embedding Types ====================

export interface EmbeddingModelsResponse {
  models: string[];
}

export interface EmbeddingModelInfo {
  model: string;
  dimension: number;
}

export interface EmbeddingModelsWithDimensionsResponse {
  models: EmbeddingModelInfo[];
}

// ==================== Batch Types ====================

export interface BatchFileInfo {
  filename: string;
  session_id: string | null;
  status: "pending" | "ready" | "committing" | "committed" | "error";
  error?: string | null;
  chunk_count?: number | null;
  page_count?: number | null;
  job_id?: string | null;
}

export interface BatchResponse {
  batch_id: string;
  name: string;
  files: BatchFileInfo[];
  total_files: number;
  ready_count: number;
  committed_count: number;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface BatchListResponse {
  batches: BatchResponse[];
}

export interface BatchCommitRequest {
  embedding_model: string;
  index_name?: string;
}

export interface BatchCommitResponse {
  batch_id: string;
  job_ids: string[];
  job_session_map: Record<string, string>; // job_id -> session_id
  skipped_files: string[];
  total_jobs: number;
}

// ==================== OpenSearch Index Types ====================

export interface IndexInfo {
  index_name: string;
  doc_count: number;
  size_bytes: number;
  size_human: string;
  dimension: number | null;
  health: string;
  status: string;
}

export interface IndexListResponse {
  indices: IndexInfo[];
}

export interface IndexDeleteResponse {
  index_name: string;
  deleted: boolean;
  message: string;
}

// ==================== JSONL Import Types ====================

export interface JSONLPreviewChunk {
  line_no: number;
  doc_id: string | null;
  chunk_id: string | null;
  text_preview: string;
  char_len: number;
  metadata: Record<string, unknown>;
}

export interface JSONLPreviewResponse {
  total_chunks: number;
  preview: JSONLPreviewChunk[];
  warnings: string[];
  doc_ids: string[];
  error?: string;
}
