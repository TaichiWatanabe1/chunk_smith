"""
ChunkSmith Hybrid - PDF Extractor
Extract text from PDF using PyMuPDF (fitz)
"""

from datetime import datetime
from typing import List, Tuple

import fitz  # PyMuPDF

from ..core.config import settings
from ..core.errors import PDFExtractFailedError
from ..core.models import ExtractMeta, RawPage


def extract_pdf_to_pages(
    pdf_bytes: bytes,
    extractor_version: str,
) -> Tuple[List[RawPage], ExtractMeta]:
    """
    Extract text from PDF bytes into pages.

    Uses PyMuPDF (fitz) to extract text from each page.

    Args:
        pdf_bytes: Raw PDF file bytes
        extractor_version: Version string for the extractor

    Returns:
        Tuple of (list of RawPage, ExtractMeta)

    Raises:
        PDFExtractFailedError: If extraction fails
    """
    try:
        # Open PDF from bytes
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise PDFExtractFailedError(f"Failed to open PDF: {str(e)}")

    try:
        pages: List[RawPage] = []
        warnings: List[str] = []

        page_count = len(doc)
        empty_page_count = 0

        for page_idx in range(page_count):
            try:
                page = doc[page_idx]
                # Extract text from page
                text = page.get_text("text")

                # Normalize line endings
                text = text.replace("\r\n", "\n")

                # Track empty pages
                if len(text.strip()) < 10:
                    empty_page_count += 1

                # Page numbers are 1-based
                pages.append(RawPage(page_no=page_idx + 1, text=text))

            except Exception as e:
                warnings.append(f"PAGE_{page_idx + 1}_EXTRACT_ERROR: {str(e)}")
                # Add empty page on error
                pages.append(RawPage(page_no=page_idx + 1, text=""))

        # Add warning if many pages are empty
        empty_ratio = empty_page_count / page_count if page_count > 0 else 0
        if empty_ratio > 0.5:
            warnings.append(
                f"TEXT_EMPTY_MANY_PAGES: {empty_page_count}/{page_count} pages have little or no text"
            )

        # Create metadata
        meta = ExtractMeta(
            extractor_name=settings.PDF_EXTRACTOR,
            extractor_version=extractor_version,
            page_count=page_count,
            warnings=warnings,
            created_at=datetime.utcnow(),
        )

        return pages, meta

    except Exception as e:
        raise PDFExtractFailedError(f"Extraction failed: {str(e)}")

    finally:
        doc.close()


def get_pdf_page_count(pdf_bytes: bytes) -> int:
    """
    Get the number of pages in a PDF without full extraction.

    Args:
        pdf_bytes: Raw PDF file bytes

    Returns:
        Number of pages

    Raises:
        PDFExtractFailedError: If PDF cannot be opened
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        count = len(doc)
        doc.close()
        return count
    except Exception as e:
        raise PDFExtractFailedError(f"Failed to open PDF: {str(e)}")
