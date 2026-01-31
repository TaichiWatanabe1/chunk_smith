"""
ChunkSmith Hybrid - Page Marker Handling
Build and parse page markers in full text
"""

import re
from typing import List

from .errors import PageMarkerInvalidError
from .models import RawPage


# Page marker format: <<<PAGE:N>>>
PAGE_MARKER_PATTERN = re.compile(r"<<<PAGE:(\d+)>>>")
PAGE_MARKER_FORMAT = "<<<PAGE:{page_no}>>>"


def build_text(pages: List[RawPage]) -> str:
    """
    Build full text with page markers from pages.

    Format:
        <<<PAGE:1>>>
        ...page1 content...
        <<<PAGE:2>>>
        ...page2 content...

    Args:
        pages: List of RawPage objects

    Returns:
        Full text with page markers
    """
    if not pages:
        return ""

    parts = []
    for page in pages:
        marker = PAGE_MARKER_FORMAT.format(page_no=page.page_no)
        parts.append(marker)
        parts.append(page.text)

    return "\n".join(parts)


def parse_text(current_text: str, expected_page_count: int) -> List[RawPage]:
    """
    Parse full text with page markers back to pages.

    Validates:
        - All page markers from 1 to expected_page_count exist
        - No duplicate page markers
        - Markers are in sequential order

    Args:
        current_text: Full text with page markers
        expected_page_count: Expected number of pages

    Returns:
        List of RawPage objects

    Raises:
        PageMarkerInvalidError: If validation fails
    """
    if expected_page_count == 0:
        if current_text.strip():
            raise PageMarkerInvalidError(
                "Expected 0 pages but text is not empty",
                {"expected": 0, "text_length": len(current_text)},
            )
        return []

    # Find all page markers with their positions
    markers = []
    for match in PAGE_MARKER_PATTERN.finditer(current_text):
        page_no = int(match.group(1))
        markers.append((page_no, match.start(), match.end()))

    # Check for missing markers
    if not markers:
        raise PageMarkerInvalidError(
            "No page markers found",
            {"expected_page_count": expected_page_count},
        )

    # Extract page numbers found
    found_page_nos = [m[0] for m in markers]

    # Check for duplicates
    if len(found_page_nos) != len(set(found_page_nos)):
        duplicates = [p for p in found_page_nos if found_page_nos.count(p) > 1]
        raise PageMarkerInvalidError(
            "Duplicate page markers found",
            {"duplicates": list(set(duplicates))},
        )

    # Check for expected pages
    expected_pages = set(range(1, expected_page_count + 1))
    found_pages = set(found_page_nos)

    missing = expected_pages - found_pages
    extra = found_pages - expected_pages

    if missing:
        raise PageMarkerInvalidError(
            "Missing page markers",
            {"missing_pages": sorted(missing)},
        )

    if extra:
        raise PageMarkerInvalidError(
            "Unexpected page markers",
            {"extra_pages": sorted(extra)},
        )

    # Check order
    for i in range(len(found_page_nos) - 1):
        if found_page_nos[i] >= found_page_nos[i + 1]:
            raise PageMarkerInvalidError(
                "Page markers are not in sequential order",
                {
                    "position": i,
                    "found_order": found_page_nos,
                },
            )

    # Extract pages
    pages = []
    for i, (page_no, start, end) in enumerate(markers):
        # Content starts after the marker
        content_start = end
        # Skip the newline after marker if present
        if content_start < len(current_text) and current_text[content_start] == "\n":
            content_start += 1

        # Content ends at next marker or end of text
        if i + 1 < len(markers):
            content_end = markers[i + 1][1]
            # Remove trailing newline before next marker
            if content_end > 0 and current_text[content_end - 1] == "\n":
                content_end -= 1
        else:
            content_end = len(current_text)

        text = current_text[content_start:content_end]
        pages.append(RawPage(page_no=page_no, text=text))

    return pages


def get_page_marker_positions(current_text: str) -> List[tuple]:
    """
    Get positions of all page markers in text.

    Args:
        current_text: Full text with page markers

    Returns:
        List of (page_no, start, end) tuples
    """
    markers = []
    for match in PAGE_MARKER_PATTERN.finditer(current_text):
        page_no = int(match.group(1))
        markers.append((page_no, match.start(), match.end()))
    return markers
