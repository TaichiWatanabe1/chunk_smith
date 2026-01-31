"""
ChunkSmith Hybrid - Chunking Logic
Build page_map (blue boundaries) and chunks (red boundaries)
"""

import re
from typing import List, Tuple

from .hashing import hash_chunk, hash_page
from .models import ChildChunk, ChunkStrategy, PageSpan, RawPage
from .page_marker import PAGE_MARKER_PATTERN, get_page_marker_positions


def build_page_map(
    current_text: str,
    pages: List[RawPage],
    doc_id: str,
) -> List[PageSpan]:
    """
    Build page map (blue boundaries) from current_text.

    Each PageSpan represents a page's position in the full text,
    starting at the <<<PAGE:N>>> marker.

    Args:
        current_text: Full text with page markers
        pages: List of RawPage objects
        doc_id: Document identifier

    Returns:
        List of PageSpan objects
    """
    if not pages:
        return []

    # Get marker positions
    markers = get_page_marker_positions(current_text)

    page_spans = []
    for i, (page_no, marker_start, marker_end) in enumerate(markers):
        # Find the corresponding page
        page = next((p for p in pages if p.page_no == page_no), None)
        if page is None:
            continue

        # Start is at the marker position (blue line at marker)
        start = marker_start

        # End is at the next marker or end of text
        if i + 1 < len(markers):
            end = markers[i + 1][1]
        else:
            end = len(current_text)

        # Calculate character length (excluding marker itself)
        content_start = marker_end
        if content_start < len(current_text) and current_text[content_start] == "\n":
            content_start += 1
        char_len = end - content_start

        # Compute hash
        page_hash = hash_page(doc_id, page_no, page.text)

        page_spans.append(
            PageSpan(
                page_no=page_no,
                start=start,
                end=end,
                char_len=char_len,
                hash=page_hash,
            )
        )

    return page_spans


def _find_paragraph_boundaries(text: str) -> List[int]:
    """
    Find paragraph boundary positions in text.

    Looks for double newlines (\n\n) and single newlines (\n).

    Args:
        text: Text to analyze

    Returns:
        Sorted list of potential boundary positions
    """
    boundaries = set()

    # Double newlines (strong boundary)
    for match in re.finditer(r"\n\n+", text):
        boundaries.add(match.end())

    # Single newlines (weak boundary)
    for match in re.finditer(r"\n", text):
        boundaries.add(match.end())

    return sorted(boundaries)


def _find_heading_boundaries(text: str) -> List[int]:
    """
    Find heading boundary positions in text.

    Looks for patterns like:
        - Lines starting with numbers (1., 1.1, etc.)
        - Lines starting with # (markdown)
        - Lines that are all caps and short

    Args:
        text: Text to analyze

    Returns:
        Sorted list of potential boundary positions
    """
    boundaries = set()

    # Numbered headings: "1.", "1.1", "1.1.1" etc. at line start
    for match in re.finditer(r"(?:^|\n)(\d+(?:\.\d+)*\.?\s)", text):
        boundaries.add(match.start())

    # Markdown-style headings
    for match in re.finditer(r"(?:^|\n)(#{1,6}\s)", text):
        boundaries.add(match.start())

    # All-caps lines (potential headings)
    for match in re.finditer(r"(?:^|\n)([A-Z][A-Z\s]{2,50})(?:\n|$)", text):
        boundaries.add(match.start())

    # Also include paragraph boundaries
    boundaries.update(_find_paragraph_boundaries(text))

    return sorted(boundaries)


def _snap_to_boundary(
    position: int,
    boundaries: List[int],
    min_pos: int,
    max_pos: int,
    snap_range: int = 100,
) -> int:
    """
    Snap a position to the nearest boundary within range.

    Args:
        position: Target position
        boundaries: List of boundary positions
        min_pos: Minimum allowed position
        max_pos: Maximum allowed position
        snap_range: Maximum distance to snap

    Returns:
        Snapped position
    """
    best_pos = position
    best_dist = snap_range + 1

    for boundary in boundaries:
        if boundary < min_pos or boundary > max_pos:
            continue

        dist = abs(boundary - position)
        if dist < best_dist:
            best_dist = dist
            best_pos = boundary

    return best_pos


def _chunk_text_chars(
    text: str,
    chunk_size: int,
    overlap: int,
) -> List[Tuple[int, int]]:
    """
    Chunk text by fixed character windows.

    Args:
        text: Text to chunk
        chunk_size: Target chunk size
        overlap: Overlap between chunks

    Returns:
        List of (start, end) tuples relative to text
    """
    if not text:
        return []

    chunks = []
    text_len = len(text)
    step = max(1, chunk_size - overlap)

    pos = 0
    while pos < text_len:
        end = min(pos + chunk_size, text_len)
        chunks.append((pos, end))

        if end >= text_len:
            break

        pos += step

    return chunks


def _chunk_text_paragraph(
    text: str,
    chunk_size: int,
    overlap: int,
) -> List[Tuple[int, int]]:
    """
    Chunk text by paragraph boundaries.

    Args:
        text: Text to chunk
        chunk_size: Target chunk size
        overlap: Overlap between chunks

    Returns:
        List of (start, end) tuples relative to text
    """
    if not text:
        return []

    boundaries = _find_paragraph_boundaries(text)
    chunks = []
    text_len = len(text)
    step = max(1, chunk_size - overlap)

    pos = 0
    while pos < text_len:
        # Calculate raw end position
        raw_end = min(pos + chunk_size, text_len)

        # Snap end to nearest paragraph boundary
        end = _snap_to_boundary(raw_end, boundaries, pos + 1, text_len)
        if end == raw_end and raw_end < text_len:
            # If no boundary found, use raw position
            end = raw_end

        chunks.append((pos, end))

        if end >= text_len:
            break

        # Calculate next start position
        next_pos = pos + step
        # Snap next start to boundary
        next_pos = _snap_to_boundary(next_pos, boundaries, end - overlap, end)
        if next_pos <= pos:
            next_pos = pos + step

        pos = next_pos

    return chunks


def _chunk_text_heading(
    text: str,
    chunk_size: int,
    overlap: int,
) -> List[Tuple[int, int]]:
    """
    Chunk text by heading boundaries.

    Args:
        text: Text to chunk
        chunk_size: Target chunk size
        overlap: Overlap between chunks

    Returns:
        List of (start, end) tuples relative to text
    """
    if not text:
        return []

    boundaries = _find_heading_boundaries(text)
    chunks = []
    text_len = len(text)
    step = max(1, chunk_size - overlap)

    pos = 0
    while pos < text_len:
        # Calculate raw end position
        raw_end = min(pos + chunk_size, text_len)

        # Snap end to nearest heading boundary
        end = _snap_to_boundary(raw_end, boundaries, pos + 1, text_len)
        if end == raw_end and raw_end < text_len:
            end = raw_end

        chunks.append((pos, end))

        if end >= text_len:
            break

        # Calculate next start position
        next_pos = pos + step
        next_pos = _snap_to_boundary(next_pos, boundaries, end - overlap, end)
        if next_pos <= pos:
            next_pos = pos + step

        pos = next_pos

    return chunks


def _chunk_page_text(
    text: str,
    strategy: ChunkStrategy,
) -> List[Tuple[int, int]]:
    """
    Chunk a page's text according to strategy.

    Args:
        text: Page text content
        strategy: Chunking strategy

    Returns:
        List of (start, end) tuples relative to text
    """
    if strategy.split_mode == "chars":
        return _chunk_text_chars(text, strategy.chunk_size, strategy.overlap)
    elif strategy.split_mode == "paragraph":
        return _chunk_text_paragraph(text, strategy.chunk_size, strategy.overlap)
    elif strategy.split_mode == "heading":
        return _chunk_text_heading(text, strategy.chunk_size, strategy.overlap)
    else:
        # Default to chars
        return _chunk_text_chars(text, strategy.chunk_size, strategy.overlap)


def chunk_pages(
    current_text: str,
    page_map: List[PageSpan],
    pages: List[RawPage],
    strategy: ChunkStrategy,
    doc_id: str,
) -> List[ChildChunk]:
    """
    Generate child chunks (red boundaries) from pages.

    Args:
        current_text: Full text with page markers
        page_map: Page spans (blue boundaries)
        pages: List of RawPage objects
        strategy: Chunking strategy
        doc_id: Document identifier

    Returns:
        List of ChildChunk objects
    """
    if not pages or not page_map:
        return []

    chunks = []
    total_chunk_idx = 0

    for page_span in page_map:
        page_no = page_span.page_no

        # Find corresponding page
        page = next((p for p in pages if p.page_no == page_no), None)
        if page is None:
            continue

        # Get page content from current_text (after the marker)
        # Find marker end
        marker_end = page_span.start
        for match in PAGE_MARKER_PATTERN.finditer(current_text[page_span.start:page_span.end]):
            marker_end = page_span.start + match.end()
            break

        # Skip newline after marker
        content_start = marker_end
        if content_start < len(current_text) and current_text[content_start] == "\n":
            content_start += 1

        content_end = page_span.end
        page_content = current_text[content_start:content_end]

        # Chunk the page content
        local_chunks = _chunk_page_text(page_content, strategy)

        for local_idx, (local_start, local_end) in enumerate(local_chunks):
            # Convert to global offsets in current_text
            global_start = content_start + local_start
            global_end = content_start + local_end

            # Generate chunk ID: PXXX-CYYY format
            chunk_id = f"P{page_no:03d}-C{local_idx + 1:03d}"

            # Get chunk text
            chunk_text = current_text[global_start:global_end]

            # Compute hash
            chunk_hash = hash_chunk(doc_id, chunk_id, chunk_text)

            # Check for warnings
            warnings = []
            if len(chunk_text.strip()) < 10:
                warnings.append("CHUNK_TOO_SHORT")

            chunks.append(
                ChildChunk(
                    chunk_id=chunk_id,
                    page_no=page_no,
                    start=global_start,
                    end=global_end,
                    char_len=len(chunk_text),
                    hash=chunk_hash,
                    warnings=warnings,
                )
            )
            total_chunk_idx += 1

    return chunks
