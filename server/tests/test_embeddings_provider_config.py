"""Tests for embedding provider."""


def test_langchain_provider_can_be_instantiated():
    # Just verify import works - actual embedding test requires network
    from app.integrations.embeddings.langchain_openai import LangChainOpenAIEmbeddingProvider
    assert LangChainOpenAIEmbeddingProvider is not None
