"""
Tests for chunking functionality
"""

import pytest

from app.core.chunking import build_page_map, chunk_pages
from app.core.models import ChunkStrategy, RawPage
from app.core.page_marker import build_text


class TestBuildPageMap:
    """Tests for build_page_map function."""

    def test_empty_pages(self):
        """Empty pages should return empty map."""
        result = build_page_map("", [], "doc1")
        assert result == []

    def test_single_page(self):
        """Single page should produce one page span."""
        pages = [RawPage(page_no=1, text="Hello World")]
        text = build_text(pages)
        
        result = build_page_map(text, pages, "doc1")
        
        assert len(result) == 1
        assert result[0].page_no == 1
        assert result[0].start == 0

    def test_multiple_pages(self):
        """Multiple pages should produce correct spans."""
        pages = [
            RawPage(page_no=1, text="Page 1"),
            RawPage(page_no=2, text="Page 2"),
        ]
        text = build_text(pages)
        
        result = build_page_map(text, pages, "doc1")
        
        assert len(result) == 2
        assert result[0].page_no == 1
        assert result[1].page_no == 2
        # Second page should start after first
        assert result[1].start > result[0].start


class TestChunkPages:
    """Tests for chunk_pages function."""

    def test_empty_pages(self):
        """Empty pages should return no chunks."""
        result = chunk_pages(
            "", [], [], ChunkStrategy(chunk_size=100, overlap=10), "doc1"
        )
        assert result == []

    def test_single_small_page(self):
        """Small page should produce single chunk."""
        pages = [RawPage(page_no=1, text="Short text")]
        text = build_text(pages)
        page_map = build_page_map(text, pages, "doc1")
        strategy = ChunkStrategy(chunk_size=100, overlap=10, split_mode="chars")
        
        result = chunk_pages(text, page_map, pages, strategy, "doc1")
        
        assert len(result) >= 1
        assert result[0].page_no == 1
        assert result[0].chunk_id.startswith("P001-C")

    def test_large_page_multiple_chunks(self):
        """Large page should produce multiple chunks."""
        # Create page with ~500 chars
        long_text = "A" * 500
        pages = [RawPage(page_no=1, text=long_text)]
        text = build_text(pages)
        page_map = build_page_map(text, pages, "doc1")
        strategy = ChunkStrategy(chunk_size=100, overlap=20, split_mode="chars")
        
        result = chunk_pages(text, page_map, pages, strategy, "doc1")
        
        # Should have multiple chunks
        assert len(result) > 1
        # All chunks should be on page 1
        assert all(c.page_no == 1 for c in result)

    def test_chunk_ids_format(self):
        """Chunk IDs should follow PXXX-CYYY format."""
        pages = [RawPage(page_no=1, text="Some text here for testing")]
        text = build_text(pages)
        page_map = build_page_map(text, pages, "doc1")
        strategy = ChunkStrategy(chunk_size=10, overlap=2, split_mode="chars")
        
        result = chunk_pages(text, page_map, pages, strategy, "doc1")
        
        for chunk in result:
            assert chunk.chunk_id.startswith("P001-C")
            # Check format: P###-C###
            parts = chunk.chunk_id.split("-")
            assert len(parts) == 2
            assert parts[0].startswith("P")
            assert parts[1].startswith("C")

    def test_offsets_in_current_text(self):
        """Chunk offsets should be valid positions in current_text."""
        pages = [RawPage(page_no=1, text="Test content for chunking")]
        text = build_text(pages)
        page_map = build_page_map(text, pages, "doc1")
        strategy = ChunkStrategy(chunk_size=10, overlap=2, split_mode="chars")
        
        result = chunk_pages(text, page_map, pages, strategy, "doc1")
        
        for chunk in result:
            # Offsets should be within text bounds
            assert 0 <= chunk.start < len(text)
            assert chunk.start < chunk.end <= len(text)
            # char_len should match actual length
            assert chunk.char_len == chunk.end - chunk.start
