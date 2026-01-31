"""
ChunkSmith - JSONL Parser
Parse JSONL files into chunks for import
"""

import json
from typing import Any, Dict, List, Tuple

from ..core.errors import ChunkSmithError
from ..core.logging import get_logger

logger = get_logger(__name__)


class JSONLParseError(ChunkSmithError):
    """Error parsing JSONL file."""

    def __init__(self, message: str, line_no: int = 0):
        self.line_no = line_no
        super().__init__(f"JSONL parse error at line {line_no}: {message}" if line_no else message)


class JSONLChunk:
    """Represents a chunk parsed from JSONL."""

    def __init__(
        self,
        text: str,
        doc_id: str | None = None,
        chunk_id: str | None = None,
        metadata: Dict[str, Any] | None = None,
        line_no: int = 0,
    ):
        self.text = text
        self.doc_id = doc_id
        self.chunk_id = chunk_id
        self.metadata = metadata or {}
        self.line_no = line_no


def parse_jsonl(content: bytes, default_doc_id: str) -> Tuple[List[JSONLChunk], List[str]]:
    """
    Parse JSONL content into chunks.

    Args:
        content: Raw JSONL file bytes
        default_doc_id: Default doc_id to use if not specified in JSONL

    Returns:
        Tuple of (list of JSONLChunk, list of warnings)

    Raises:
        JSONLParseError: If parsing fails
    """
    try:
        text_content = content.decode("utf-8")
    except UnicodeDecodeError:
        raise JSONLParseError("File is not valid UTF-8")

    lines = text_content.strip().split("\n")
    if not lines or (len(lines) == 1 and not lines[0].strip()):
        raise JSONLParseError("File is empty")

    chunks: List[JSONLChunk] = []
    warnings: List[str] = []

    for line_no, line in enumerate(lines, start=1):
        line = line.strip()
        if not line:
            continue

        try:
            obj = json.loads(line)
        except json.JSONDecodeError as e:
            raise JSONLParseError(f"Invalid JSON: {e}", line_no)

        if not isinstance(obj, dict):
            raise JSONLParseError("Each line must be a JSON object", line_no)

        # Validate required field
        if "text" not in obj:
            raise JSONLParseError("Missing required field 'text'", line_no)

        text = obj["text"]
        if not isinstance(text, str):
            raise JSONLParseError("'text' must be a string", line_no)

        if not text.strip():
            warnings.append(f"Line {line_no}: empty text")
            continue

        # Optional fields
        doc_id = obj.get("doc_id", default_doc_id)
        chunk_id = obj.get("chunk_id")
        metadata = obj.get("metadata", {})

        if not isinstance(metadata, dict):
            warnings.append(f"Line {line_no}: 'metadata' is not an object, ignoring")
            metadata = {}

        chunks.append(JSONLChunk(
            text=text,
            doc_id=doc_id,
            chunk_id=chunk_id,
            metadata=metadata,
            line_no=line_no,
        ))

    if not chunks:
        raise JSONLParseError("No valid chunks found in file")

    logger.info(f"Parsed {len(chunks)} chunks from JSONL")
    return chunks, warnings


def validate_jsonl_preview(content: bytes, default_doc_id: str, max_preview: int = 10) -> Dict[str, Any]:
    """
    Validate JSONL and return preview information.

    Args:
        content: Raw JSONL file bytes
        default_doc_id: Default doc_id
        max_preview: Maximum number of chunks to include in preview

    Returns:
        Preview information dict
    """
    chunks, warnings = parse_jsonl(content, default_doc_id)

    preview_chunks = []
    for chunk in chunks[:max_preview]:
        preview_chunks.append({
            "line_no": chunk.line_no,
            "doc_id": chunk.doc_id,
            "chunk_id": chunk.chunk_id,
            "text_preview": chunk.text[:100] + "..." if len(chunk.text) > 100 else chunk.text,
            "char_len": len(chunk.text),
            "metadata": chunk.metadata,
        })

    return {
        "total_chunks": len(chunks),
        "preview": preview_chunks,
        "warnings": warnings,
        "doc_ids": list(set(c.doc_id for c in chunks if c.doc_id)),
    }
