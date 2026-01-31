/**
 * Session Store (Zustand)
 * Central state management for the ChunkSmith editor
 */

import { create } from "zustand";
import type {
  ChunkStrategy,
  PageSpan,
  ChildChunk,
  ChunkMetadata,
  SearchHit,
} from "../types/dtos";
import * as sessionsApi from "../api/sessions";
import * as searchApi from "../api/search";
import { ApiError } from "../api/client";

interface SessionState {
  // Session data
  sessionId: string | null;
  docId: string | null;
  sourceType: "pdf" | "jsonl";
  version: number;
  currentText: string;
  chunkStrategy: ChunkStrategy;
  pageMap: PageSpan[];
  chunks: ChildChunk[];
  chunkMetadataById: Record<string, ChunkMetadata>;

  // Selection
  selectedChunkId: string | null;

  // Search
  searchQuery: string;
  searchMode: "text" | "vector" | "hybrid";
  embeddingModel: string;
  searchHits: SearchHit[];
  isSearching: boolean;

  // Job
  // job related state removed; batchStore manages commit job progress

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSession: (sessionId: string) => Promise<void>;
  setCurrentText: (text: string) => Promise<void>;
  setChunkStrategy: (strategy: ChunkStrategy) => Promise<void>;
  selectChunk: (chunkId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSearchMode: (mode: "text" | "vector" | "hybrid") => void;
  setEmbeddingModel: (model: string) => void;
  executeSearch: () => Promise<void>;
  setSearchHits: (hits: SearchHit[]) => void;
  // job methods removed; use batchStore for commit progress
  clearError: () => void;
  resetSession: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // Initial state
  sessionId: null,
  docId: null,
  sourceType: "pdf",
  version: 0,
  currentText: "",
  chunkStrategy: {
    chunk_size: 800,
    overlap: 100,
    split_mode: "paragraph",
    normalize: true,
  },
  pageMap: [],
  chunks: [],
  chunkMetadataById: {},
  selectedChunkId: null,
  searchQuery: "",
  searchMode: "text",
  embeddingModel: "", // Will be set from API
  searchHits: [],
  isSearching: false,
  // jobId/jobStatus removed
  isLoading: false,
  error: null,

  // Actions
  loadSession: async (sessionId: string) => {
    set({ isLoading: true, error: null });
    try {
      const session = await sessionsApi.getSession(sessionId);
      set({
        sessionId: session.session_id,
        docId: session.doc_id,
        sourceType: session.source_type || "pdf",
        version: session.version,
        currentText: session.current_text,
        chunkStrategy: session.chunk_strategy,
        pageMap: session.page_map,
        chunks: session.chunks,
        chunkMetadataById: session.chunk_metadata,
        isLoading: false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load session";
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  setCurrentText: async (text: string) => {
    const { sessionId, version } = get();
    if (!sessionId) return;

    try {
      const response = await sessionsApi.updateText(sessionId, version, text);
      set({
        version: response.version,
        currentText: response.current_text,
        pageMap: response.page_map,
        chunks: response.chunks,
        error: null,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Version conflict - reload session
        alert("Version conflict detected. Reloading session...");
        await get().loadSession(sessionId);
      } else if (error instanceof ApiError && error.status === 422) {
        // Page marker validation error
        const body = error.body as { detail?: string };
        alert(`Validation error: ${body?.detail || "Invalid page markers"}`);
      } else {
        const message =
          error instanceof Error ? error.message : "Failed to update text";
        set({ error: message });
      }
      throw error;
    }
  },

  setChunkStrategy: async (strategy: ChunkStrategy) => {
    const { sessionId, version } = get();
    if (!sessionId) return;

    try {
      const response = await sessionsApi.updateChunkStrategy(
        sessionId,
        version,
        strategy,
      );
      set({
        chunkStrategy: response.chunk_strategy,
        pageMap: response.page_map,
        chunks: response.chunks,
        version: get().version + 1, // Increment version locally
        error: null,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        alert("Version conflict detected. Reloading session...");
        await get().loadSession(sessionId);
      } else {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to update chunk strategy";
        set({ error: message });
      }
      throw error;
    }
  },

  selectChunk: (chunkId: string | null) => {
    set({ selectedChunkId: chunkId });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setSearchMode: (mode: "text" | "vector" | "hybrid") => {
    set({ searchMode: mode });
  },

  setEmbeddingModel: (model: string) => {
    set({ embeddingModel: model });
  },

  executeSearch: async () => {
    const { searchQuery, searchMode, embeddingModel, docId, sessionId } = get();
    if (!searchQuery.trim()) return;

    set({ isSearching: true, error: null });
    try {
      const response = await searchApi.search({
        query: searchQuery,
        mode: searchMode,
        embedding_model: searchMode !== "text" ? embeddingModel : undefined,
        filters: {
          ...(docId && { doc_id: docId }),
          ...(sessionId && { session_id: sessionId }),
        },
      });
      set({ searchHits: response.hits, isSearching: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed";
      set({ error: message, isSearching: false });
    }
  },

  setSearchHits: (hits: SearchHit[]) => {
    set({ searchHits: hits });
  },

  // job-related actions removed

  clearError: () => {
    set({ error: null });
  },

  resetSession: () => {
    set({
      sessionId: null,
      docId: null,
      sourceType: "pdf",
      version: 0,
      currentText: "",
      pageMap: [],
      chunks: [],
      chunkMetadataById: {},
      selectedChunkId: null,
      searchQuery: "",
      searchMode: "text",
      searchHits: [],
      isSearching: false,
      isLoading: false,
      error: null,
    });
  },
}));
