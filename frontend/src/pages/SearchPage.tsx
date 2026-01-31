/**
 * Search Page
 * Dedicated search interface across indexed chunks
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listIndices } from "../api/indices";
import { search } from "../api/search";
import type { IndexInfo, SearchHit, SearchRequest } from "../types/dtos";

/**
 * Extract human-readable model name from index_name.
 * Index format: chunksmith-chunks__<model_key>
 */
function extractModelFromIndex(indexName: string): string {
  if (indexName.includes("__")) {
    const modelKey = indexName.split("__")[1];
    // Convert underscore back to readable format
    return modelKey.replace(/_/g, "-");
  }
  return indexName;
}

export function SearchPage() {
  const navigate = useNavigate();

  // Index state
  const [indices, setIndices] = useState<IndexInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<string>("");
  const [isLoadingIndices, setIsLoadingIndices] = useState(true);

  // Search state
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"text" | "vector" | "hybrid">(
    "hybrid",
  );
  const [topK, setTopK] = useState(20);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results state
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [lastSearch, setLastSearch] = useState<{
    index: string;
    mode: string;
    took_ms: number;
  } | null>(null);

  // Detail panel state
  const [selectedHit, setSelectedHit] = useState<SearchHit | null>(null);

  // Derived: embedding model for the selected index
  const embeddingModel = selectedIndex
    ? extractModelFromIndex(selectedIndex)
    : "";

  // Load indices on mount
  useEffect(() => {
    loadIndices();
  }, []);

  const loadIndices = async () => {
    setIsLoadingIndices(true);
    setError(null);
    try {
      const response = await listIndices();
      setIndices(response.indices);
      // Auto-select first index if available
      if (response.indices.length > 0 && !selectedIndex) {
        setSelectedIndex(response.indices[0].index_name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load indices");
    } finally {
      setIsLoadingIndices(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim() || !selectedIndex) return;

    setIsSearching(true);
    setError(null);
    setSelectedHit(null);

    try {
      const req: SearchRequest = {
        query: query.trim(),
        mode: searchMode,
        top_k: topK,
        index_name: selectedIndex,
      };

      const response = await search(req);
      setHits(response.hits);
      setLastSearch({
        index: response.index_name,
        mode: response.mode,
        took_ms: response.took_ms,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setHits([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case "green":
        return "bg-emerald-100 text-emerald-700";
      case "yellow":
        return "bg-amber-100 text-amber-700";
      case "red":
        return "bg-red-100 text-red-700";
      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  const selectedIndexInfo = indices.find((i) => i.index_name === selectedIndex);

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Back to Editor"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <span className="font-bold text-slate-800 text-lg">Search</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/indices")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                />
              </svg>
              Indices
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex">
        {/* Left: Search Panel */}
        <div className="w-[400px] flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
          {/* Search Controls */}
          <div className="p-4 border-b border-slate-200 space-y-4">
            {/* Index Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Index
              </label>
              <select
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(e.target.value)}
                disabled={isLoadingIndices}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                {isLoadingIndices ? (
                  <option>Loading...</option>
                ) : indices.length === 0 ? (
                  <option value="">No indices available</option>
                ) : (
                  indices.map((idx) => (
                    <option key={idx.index_name} value={idx.index_name}>
                      {idx.index_name} ({idx.doc_count.toLocaleString()} docs)
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Index Info Badge */}
            {selectedIndexInfo && (
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${getHealthColor(selectedIndexInfo.health)}`}
                >
                  {selectedIndexInfo.health}
                </span>
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                  {selectedIndexInfo.size_human}
                </span>
                {selectedIndexInfo.dimension && (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-violet-100 text-violet-700">
                    {selectedIndexInfo.dimension}d
                  </span>
                )}
              </div>
            )}

            {/* Embedding Model (read-only) */}
            {embeddingModel && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Embedding Model
                </label>
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                  <svg
                    className="w-4 h-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span className="truncate font-mono text-xs">
                    {embeddingModel}
                  </span>
                  <span title="Auto-detected from index">
                    <svg
                      className="w-4 h-4 text-slate-400 ml-auto flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Locked to index embedding model
                </p>
              </div>
            )}

            {/* Search Mode & Top-K */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Mode
                </label>
                <select
                  value={searchMode}
                  onChange={(e) =>
                    setSearchMode(
                      e.target.value as "text" | "vector" | "hybrid",
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="text">Text (BM25)</option>
                  <option value="vector">Vector (kNN)</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Top K
                </label>
                <input
                  type="number"
                  value={topK}
                  onChange={(e) =>
                    setTopK(Math.max(1, Math.min(100, Number(e.target.value))))
                  }
                  min={1}
                  max={100}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            {/* Search Input */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                Query
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter search query..."
                  className="w-full pl-3 pr-10 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 bg-white placeholder-slate-400"
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !query.trim() || !selectedIndex}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-40 transition-colors"
                >
                  {isSearching ? (
                    <svg
                      className="w-5 h-5 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Search Button */}
            <button
              onClick={handleSearch}
              disabled={isSearching || !query.trim() || !selectedIndex}
              className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isSearching ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  Search
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Results List */}
          <div className="flex-1 overflow-auto p-4">
            {lastSearch && (
              <div className="flex items-center gap-2 mb-3 text-xs text-slate-500">
                <span>
                  {hits.length} results in {lastSearch.took_ms}ms
                </span>
                <span className="px-1.5 py-0.5 bg-slate-100 rounded">
                  {lastSearch.mode}
                </span>
              </div>
            )}

            {hits.length > 0 ? (
              <div className="space-y-2">
                {hits.map((hit) => (
                  <div
                    key={`${hit.chunk_id}-${hit.rank}`}
                    onClick={() => setSelectedHit(hit)}
                    className={`p-3 border rounded-lg cursor-pointer transition-all ${
                      selectedHit?.chunk_id === hit.chunk_id &&
                      selectedHit?.rank === hit.rank
                        ? "border-blue-400 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="flex items-center justify-center w-5 h-5 bg-slate-100 rounded text-[10px] font-bold text-slate-600">
                        {hit.rank}
                      </span>
                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-medium">
                        {hit.score.toFixed(3)}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-400">
                        P{hit.page_no}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {hit.text_snippet}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                      <span className="font-mono">{hit.chunk_id}</span>
                      <span>•</span>
                      <span>{hit.doc_id}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <svg
                  className="w-12 h-12 mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <p className="text-sm font-medium">
                  {query ? "No results found" : "Enter a query to search"}
                </p>
                <p className="text-xs mt-1">
                  {!selectedIndex
                    ? "Select an index first"
                    : "Try different keywords or search mode"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="flex-1 p-6 overflow-auto">
          {selectedHit ? (
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold text-slate-800">
                      Chunk Details
                    </h2>
                    <button
                      onClick={() => setSelectedHit(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium">
                      Rank #{selectedHit.rank}
                    </span>
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium">
                      Score: {selectedHit.score.toFixed(4)}
                    </span>
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                      Page {selectedHit.page_no}
                    </span>
                    <span className="px-2 py-1 bg-violet-100 text-violet-700 rounded-lg text-xs font-mono text-[11px]">
                      {selectedHit.char_len} chars
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                  {/* IDs */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Chunk ID
                      </label>
                      <p className="font-mono text-sm text-slate-800 bg-slate-50 px-3 py-2 rounded-lg">
                        {selectedHit.chunk_id}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Document ID
                      </label>
                      <p className="font-mono text-sm text-slate-800 bg-slate-50 px-3 py-2 rounded-lg truncate">
                        {selectedHit.doc_id}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Session ID
                      </label>
                      <p className="font-mono text-sm text-slate-800 bg-slate-50 px-3 py-2 rounded-lg truncate">
                        {selectedHit.session_id}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Position
                      </label>
                      <p className="font-mono text-sm text-slate-800 bg-slate-50 px-3 py-2 rounded-lg">
                        {selectedHit.start} - {selectedHit.end}
                      </p>
                    </div>
                  </div>

                  {/* Text Content */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2">
                      Text Content
                    </label>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {selectedHit.text_snippet}
                      </p>
                    </div>
                  </div>

                  {/* Metadata */}
                  {selectedHit.metadata &&
                    Object.keys(selectedHit.metadata).length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-2">
                          Metadata
                        </label>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                          <pre className="text-xs text-slate-600 overflow-auto">
                            {JSON.stringify(selectedHit.metadata, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                  {/* Actions */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() =>
                        navigate(`/sessions/${selectedHit.session_id}`)
                      }
                      className="flex-1 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                      Open in Editor
                    </button>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(selectedHit.text_snippet)
                      }
                      className="px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                        />
                      </svg>
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <svg
                className="w-16 h-16 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-lg font-medium">Select a result</p>
              <p className="text-sm mt-1">
                Click on a search result to view details
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
