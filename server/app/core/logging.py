"""
ChunkSmith Hybrid - Logging Utilities
"""

import logging
import sys

from .config import settings


def get_logger(name: str) -> logging.Logger:
    """
    Get a configured logger.

    Args:
        name: Logger name (usually __name__)

    Returns:
        Configured logger
    """
    logger = logging.getLogger(name)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

        # Set level based on environment
        if settings.CHUNKSMITH_ENV == "dev":
            logger.setLevel(logging.DEBUG)
        else:
            logger.setLevel(logging.INFO)

    return logger
