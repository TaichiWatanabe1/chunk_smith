"""
ChunkSmith Hybrid - Text Normalization
Light normalization to clean up extracted text
"""

import re
from typing import List

from .models import RawPage


def normalize_text(text: str) -> str:
    """
    Apply light normalization to text.

    Normalizations applied:
        - Convert \\r\\n to \\n (Windows line endings)
        - Reduce 3+ consecutive blank lines to 2

    Note: Does NOT aggressively compress spaces to avoid
    breaking table formatting.

    Args:
        text: Input text

    Returns:
        Normalized text
    """
    # Convert Windows line endings
    text = text.replace("\r\n", "\n")

    # Reduce excessive blank lines (3+ -> 2)
    # A blank line is a line with only whitespace
    text = re.sub(r"\n\s*\n\s*\n(\s*\n)+", "\n\n\n", text)

    return text


def normalize_page(page: RawPage) -> RawPage:
    """
    Normalize a single page's text.

    Args:
        page: RawPage to normalize

    Returns:
        New RawPage with normalized text
    """
    return RawPage(
        page_no=page.page_no,
        text=normalize_text(page.text),
    )


def normalize_pages(pages: List[RawPage]) -> List[RawPage]:
    """
    Normalize all pages' text.

    Args:
        pages: List of RawPage objects

    Returns:
        List of RawPage objects with normalized text
    """
    return [normalize_page(page) for page in pages]
