"""
ChunkSmith Hybrid - Configuration
Environment variables and settings
"""

import os
from pathlib import Path
from typing import List


def _load_dotenv_files() -> None:
    """Load .env files (best-effort) for local development."""

    try:
        from dotenv import load_dotenv  # type: ignore
    except Exception:
        return

    server_dir = Path(__file__).resolve().parents[2]
    load_dotenv(server_dir / ".env", override=False)
    load_dotenv(server_dir / ".env.local", override=False)


_load_dotenv_files()


def get_env(key: str, default: str = "") -> str:
    """Get environment variable with default value."""
    return os.environ.get(key, default)


def get_env_int(key: str, default: int) -> int:
    """Get environment variable as integer."""
    return int(os.environ.get(key, str(default)))


def get_env_bool(key: str, default: bool) -> bool:
    """Get environment variable as boolean."""
    val = os.environ.get(key, str(default)).lower()
    return val in ("true", "1", "yes")


def get_env_list(key: str, default: str = "") -> List[str]:
    """Get environment variable as list (comma-separated)."""
    val = os.environ.get(key, default)
    if not val:
        return []
    return [item.strip() for item in val.split(",") if item.strip()]


class Settings:
    """Application settings from environment variables."""

    # General
    CHUNKSMITH_ENV: str = get_env("CHUNKSMITH_ENV", "dev")
    CHUNKSMITH_STORAGE_DIR: str = get_env("CHUNKSMITH_STORAGE_DIR", "./storage")
    CHUNKSMITH_CLEAR_STORAGE_ON_STARTUP: bool = get_env_bool(
        "CHUNKSMITH_CLEAR_STORAGE_ON_STARTUP", CHUNKSMITH_ENV == "dev"
    )
    CHUNKSMITH_MAX_PDF_MB: int = get_env_int("CHUNKSMITH_MAX_PDF_MB", 50)
    CHUNKSMITH_CORS_ORIGINS: List[str] = get_env_list(
        "CHUNKSMITH_CORS_ORIGINS", "http://localhost:5173"
    )

    # PDF Extractor
    PDF_EXTRACTOR: str = get_env("PDF_EXTRACTOR", "pymupdf")
    PDF_EXTRACTOR_VERSION: str = get_env("PDF_EXTRACTOR_VERSION", "1.0.0")

    # OpenAI / Bifrost (embedding)
    OPENAI_API_KEY: str = get_env("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = get_env("OPENAI_BASE_URL", "https://api.openai.com/v1")

    # OpenSearch
    OPENSEARCH_HOST: str = get_env("OPENSEARCH_HOST", "http://opensearch:9200")
    OPENSEARCH_BASE_INDEX: str = get_env("OPENSEARCH_BASE_INDEX", "chunksmith-chunks")
    OPENSEARCH_BULK_SIZE: int = get_env_int("OPENSEARCH_BULK_SIZE", 200)
    OPENSEARCH_VERIFY_SSL: bool = get_env_bool("OPENSEARCH_VERIFY_SSL", False)
    OPENSEARCH_USERNAME: str = get_env("OPENSEARCH_USERNAME", "")
    OPENSEARCH_PASSWORD: str = get_env("OPENSEARCH_PASSWORD", "")

    # Default Chunk Strategy
    DEFAULT_CHUNK_SIZE: int = get_env_int("DEFAULT_CHUNK_SIZE", 800)
    DEFAULT_OVERLAP: int = get_env_int("DEFAULT_OVERLAP", 100)
    DEFAULT_SPLIT_MODE: str = get_env("DEFAULT_SPLIT_MODE", "paragraph")
    DEFAULT_NORMALIZE: bool = get_env_bool("DEFAULT_NORMALIZE", True)


settings = Settings()
