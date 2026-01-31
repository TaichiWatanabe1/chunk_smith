"""
Tests for page marker functionality
"""

import pytest

from app.core.page_marker import build_text, parse_text
from app.core.models import RawPage
from app.core.errors import PageMarkerInvalidError


class TestBuildText:
    """Tests for build_text function."""

    def test_empty_pages(self):
        """Empty pages should return empty string."""
        result = build_text([])
        assert result == ""

    def test_single_page(self):
        """Single page should have marker and content."""
        pages = [RawPage(page_no=1, text="Hello World")]
        result = build_text(pages)
        assert "<<<PAGE:1>>>" in result
        assert "Hello World" in result

    def test_multiple_pages(self):
        """Multiple pages should have sequential markers."""
        pages = [
            RawPage(page_no=1, text="Page 1 content"),
            RawPage(page_no=2, text="Page 2 content"),
            RawPage(page_no=3, text="Page 3 content"),
        ]
        result = build_text(pages)
        assert "<<<PAGE:1>>>" in result
        assert "<<<PAGE:2>>>" in result
        assert "<<<PAGE:3>>>" in result
        assert "Page 1 content" in result
        assert "Page 2 content" in result
        assert "Page 3 content" in result


class TestParseText:
    """Tests for parse_text function."""

    def test_parse_single_page(self):
        """Parse single page text."""
        text = "<<<PAGE:1>>>\nHello World"
        pages = parse_text(text, expected_page_count=1)
        assert len(pages) == 1
        assert pages[0].page_no == 1
        assert pages[0].text == "Hello World"

    def test_parse_multiple_pages(self):
        """Parse multiple pages."""
        text = "<<<PAGE:1>>>\nPage 1\n<<<PAGE:2>>>\nPage 2"
        pages = parse_text(text, expected_page_count=2)
        assert len(pages) == 2
        assert pages[0].page_no == 1
        assert pages[1].page_no == 2

    def test_roundtrip(self):
        """Build and parse should be reversible."""
        original = [
            RawPage(page_no=1, text="First page"),
            RawPage(page_no=2, text="Second page"),
        ]
        text = build_text(original)
        parsed = parse_text(text, expected_page_count=2)
        
        assert len(parsed) == len(original)
        for orig, pars in zip(original, parsed):
            assert orig.page_no == pars.page_no
            assert orig.text == pars.text

    def test_missing_marker_error(self):
        """Missing marker should raise error."""
        text = "<<<PAGE:1>>>\nPage 1\n<<<PAGE:3>>>\nPage 3"
        with pytest.raises(PageMarkerInvalidError):
            parse_text(text, expected_page_count=3)

    def test_duplicate_marker_error(self):
        """Duplicate marker should raise error."""
        text = "<<<PAGE:1>>>\nPage 1\n<<<PAGE:1>>>\nAnother page 1"
        with pytest.raises(PageMarkerInvalidError):
            parse_text(text, expected_page_count=1)

    def test_no_markers_error(self):
        """No markers should raise error."""
        text = "Just some text without markers"
        with pytest.raises(PageMarkerInvalidError):
            parse_text(text, expected_page_count=1)

    def test_out_of_order_error(self):
        """Out of order markers should raise error."""
        text = "<<<PAGE:2>>>\nPage 2\n<<<PAGE:1>>>\nPage 1"
        with pytest.raises(PageMarkerInvalidError):
            parse_text(text, expected_page_count=2)
