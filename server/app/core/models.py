"""
ChunkSmith Hybrid - Pydantic Models
Data models and DTOs for API
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# ==================== Core Models ====================


class RawPage(BaseModel):
    """Represents a single page extracted from PDF."""

    page_no: int = Field(..., description="1-based page number")
    text: str = Field(..., description="Extracted text content")


class ExtractMeta(BaseModel):
    """Metadata about the PDF extraction process."""

    extractor_name: str = Field(..., description="Name of the extractor (e.g., pymupdf)")
    extractor_version: str = Field(..., description="Version of the extractor")
    page_count: int = Field(..., description="Total number of pages in the PDF")
    warnings: List[str] = Field(default_factory=list, description="Extraction warnings")
    created_at: datetime = Field(
        default_factory=datetime.utcnow, description="Extraction timestamp"
    )


class ChunkStrategy(BaseModel):
    """Configuration for chunking strategy."""

    chunk_size: int = Field(800, ge=100, le=10000, description="Target chunk size in characters")
    overlap: int = Field(100, ge=0, le=1000, description="Overlap between chunks in characters")
    split_mode: Literal["chars", "paragraph", "heading"] = Field(
        "paragraph", description="How to split text into chunks"
    )
    normalize: bool = Field(True, description="Whether to normalize text")


class PageSpan(BaseModel):
    """Represents a page boundary in the full text (blue marker)."""

    page_no: int = Field(..., description="1-based page number")
    start: int = Field(..., description="Start offset in current_text")
    end: int = Field(..., description="End offset in current_text")
    char_len: int = Field(..., description="Character length of page content")
    hash: str = Field(..., description="Hash of page content")


class ChildChunk(BaseModel):
    """Represents a chunk within a page (red marker)."""

    chunk_id: str = Field(..., description="Unique chunk identifier (e.g., P001-C001)")
    page_no: int = Field(..., description="1-based page number this chunk belongs to")
    start: int = Field(..., description="Start offset in current_text")
    end: int = Field(..., description="End offset in current_text")
    char_len: int = Field(..., description="Character length of chunk")
    hash: str = Field(..., description="Hash of chunk content")
    warnings: List[str] = Field(default_factory=list, description="Chunk-level warnings")


class ChunkMetadata(BaseModel):
    """Editable metadata for a chunk."""

    content_type: Literal["body", "table", "bullets", "caption", "other"] = Field(
        "body", description="Type of content in the chunk"
    )
    heading_path: str = Field("", description="Path of headings leading to this chunk")
    note: str = Field("", description="User notes about this chunk")
    quality_flag: Literal["good", "suspect", "broken"] = Field(
        "good", description="Quality assessment flag"
    )
    custom: Dict[str, Any] = Field(
        default_factory=dict, description="Custom metadata from JSONL import"
    )


class Session(BaseModel):
    """Complete session state for a document."""

    session_id: str = Field(..., description="Unique session identifier")
    doc_id: str = Field(..., description="Document identifier")
    batch_id: Optional[str] = Field(None, description="Batch ID if part of a batch")
    source_type: Literal["pdf", "jsonl"] = Field("pdf", description="Source file type")
    extract_meta: ExtractMeta = Field(..., description="Extraction metadata")
    base_pages: List[RawPage] = Field(..., description="Original extracted pages (immutable)")
    current_pages: List[RawPage] = Field(..., description="Current edited pages")
    current_text: str = Field(..., description="Full text with page markers")
    page_map: List[PageSpan] = Field(..., description="Page boundaries in current_text")
    chunk_strategy: ChunkStrategy = Field(..., description="Current chunking strategy")
    chunks: List[ChildChunk] = Field(..., description="Current chunks")
    chunk_metadata: Dict[str, ChunkMetadata] = Field(
        default_factory=dict, description="Metadata keyed by chunk_id"
    )
    version: int = Field(1, description="Optimistic lock version")
    created_at: datetime = Field(
        default_factory=datetime.utcnow, description="Session creation time"
    )
    updated_at: datetime = Field(
        default_factory=datetime.utcnow, description="Last update time"
    )


class BatchFileInfo(BaseModel):
    """Information about a file in a batch."""

    filename: str = Field(..., description="Original filename")
    session_id: Optional[str] = Field(None, description="Session ID if successfully created")
    status: str = Field("pending", description="Status: pending, ready, committing, committed, error")
    error: Optional[str] = Field(None, description="Error message if failed")
    chunk_count: Optional[int] = Field(None, description="Number of chunks")
    page_count: Optional[int] = Field(None, description="Number of pages")
    job_id: Optional[str] = Field(None, description="Job ID if committing/committed")


class Batch(BaseModel):
    """Batch of PDF files for bulk processing."""

    batch_id: str = Field(..., description="Unique batch identifier")
    name: str = Field(..., description="Batch name (folder name or user-defined)")
    files: List[BatchFileInfo] = Field(default_factory=list, description="Files in this batch")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ==================== Request DTOs ====================


class UpdateTextRequest(BaseModel):
    """Request to update the full text."""

    version: int = Field(..., description="Expected version for optimistic locking")
    current_text: str = Field(..., description="New full text with page markers")


class UpdateChunkStrategyRequest(BaseModel):
    """Request to update the chunk strategy."""

    version: int = Field(..., description="Expected version for optimistic locking")
    chunk_strategy: ChunkStrategy = Field(..., description="New chunk strategy")


class UpdateChunkMetadataRequest(ChunkMetadata):
    """Request to update chunk metadata (inherits from ChunkMetadata)."""

    pass


class SearchRequest(BaseModel):
    """Request for searching chunks."""

    query: str = Field(..., min_length=1, description="Search query text")
    mode: Literal["text", "vector", "hybrid"] = Field(
        "text", description="Search mode"
    )
    top_k: int = Field(20, ge=1, le=100, description="Number of results to return")
    filters: Optional[Dict[str, str]] = Field(
        None, description="Filters for search (e.g., doc_id, session_id)"
    )
    embedding_model: Optional[str] = Field(
        None, description="Embedding model for vector/hybrid search"
    )
    vector: Optional[List[float]] = Field(
        None, description="Pre-computed vector (optional)"
    )
    index_name: Optional[str] = Field(
        None, description="OpenSearch index name to search (when specified, embedding_model is extracted from index)"
    )


class CommitRequest(BaseModel):
    """Request to commit session to OpenSearch."""

    embedding_model: str = Field(..., description="Embedding model to use for vectorization")
    index_name: Optional[str] = Field(
        None, description="Custom index name. If not provided, auto-generated from model name"
    )


class BatchCommitRequest(BaseModel):
    """Request to commit all sessions in a batch."""

    embedding_model: str = Field(..., description="Embedding model to use for vectorization")
    index_name: Optional[str] = Field(
        None, description="Custom index name. If not provided, auto-generated from model name"
    )


# ==================== Response DTOs ====================


class SessionResponse(BaseModel):
    """Response containing full session data."""

    session_id: str
    doc_id: str
    batch_id: Optional[str] = None
    source_type: Literal["pdf", "jsonl"] = "pdf"
    extract_meta: ExtractMeta
    base_pages: List[RawPage]
    current_pages: List[RawPage]
    current_text: str
    page_map: List[PageSpan]
    chunk_strategy: ChunkStrategy
    chunks: List[ChildChunk]
    chunk_metadata: Dict[str, ChunkMetadata]
    version: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_session(cls, session: Session) -> "SessionResponse":
        """Create response from Session model."""
        return cls(**session.model_dump())


class UpdateTextResponse(BaseModel):
    """Response after updating text."""

    version: int
    current_text: str
    page_map: List[PageSpan]
    chunks: List[ChildChunk]


class UpdateChunkStrategyResponse(BaseModel):
    """Response after updating chunk strategy."""

    chunk_strategy: ChunkStrategy
    page_map: List[PageSpan]
    chunks: List[ChildChunk]


class ChunkDetailResponse(BaseModel):
    """Detailed information about a single chunk."""

    doc_id: str
    session_id: str
    chunk_id: str
    page_no: int
    start: int
    end: int
    char_len: int
    text: str
    extractor_version: str
    chunk_strategy: ChunkStrategy
    hash: str
    warnings: List[str]
    metadata: ChunkMetadata


class SearchHit(BaseModel):
    """Single search result."""

    rank: int = Field(..., description="1-based rank in results")
    score: float = Field(..., description="Search score")
    doc_id: str
    session_id: str
    chunk_id: str
    page_no: int
    start: int
    end: int
    char_len: int
    text_snippet: str = Field(..., description="First ~200 chars of chunk text")
    metadata: Optional[Dict[str, Any]] = None


class SearchResponse(BaseModel):
    """Search results response."""

    mode: str
    index_name: str
    top_k: int
    took_ms: int
    hits: List[SearchHit]


class CommitResponse(BaseModel):
    """Response after initiating commit."""

    job_id: str


class JobStatusResponse(BaseModel):
    """Status of a background job."""

    job_id: str
    status: Literal["queued", "running", "succeeded", "failed"]
    progress: float = Field(..., ge=0, le=1, description="Progress from 0.0 to 1.0")
    total: int = Field(..., description="Total items to process")
    succeeded: int = Field(..., description="Successfully processed items")
    failed: int = Field(..., description="Failed items")
    error_samples: List[Dict[str, Any]] = Field(
        default_factory=list, description="Sample errors for debugging"
    )


class EmbeddingModelsResponse(BaseModel):
    """Available embedding models."""

    models: List[str]


class EmbeddingModelInfo(BaseModel):
    """Information about an embedding model."""

    model: str
    dimension: int


class EmbeddingModelsWithDimensionsResponse(BaseModel):
    """Available embedding models with dimension info."""

    models: List[EmbeddingModelInfo]


class BatchResponse(BaseModel):
    """Response containing batch data."""

    batch_id: str
    name: str
    files: List["BatchFileInfo"]
    total_files: int
    ready_count: int
    committed_count: int
    error_count: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_batch(cls, batch: "Batch") -> "BatchResponse":
        """Create response from Batch model."""
        ready = sum(1 for f in batch.files if f.status == "ready")
        committed = sum(1 for f in batch.files if f.status == "committed")
        errors = sum(1 for f in batch.files if f.status == "error")
        return cls(
            batch_id=batch.batch_id,
            name=batch.name,
            files=batch.files,
            total_files=len(batch.files),
            ready_count=ready,
            committed_count=committed,
            error_count=errors,
            created_at=batch.created_at,
            updated_at=batch.updated_at,
        )


class BatchListResponse(BaseModel):
    """Response containing list of batches."""

    batches: List[BatchResponse]


class BatchCommitResponse(BaseModel):
    """Response after initiating batch commit."""

    batch_id: str
    job_ids: List[str]
    job_session_map: Dict[str, str]  # job_id -> session_id
    skipped_files: List[str]
    total_jobs: int


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "ok"
    env: str = ""


# ==================== OpenSearch Index DTOs ====================


class IndexInfo(BaseModel):
    """Information about an OpenSearch index."""

    index_name: str
    doc_count: int
    size_bytes: int
    size_human: str
    dimension: Optional[int] = None
    health: str
    status: str


class IndexListResponse(BaseModel):
    """Response containing list of indices."""

    indices: List[IndexInfo]


class IndexDeleteResponse(BaseModel):
    """Response after deleting an index."""

    index_name: str
    deleted: bool
    message: str
