/**
 * Search Panel Component
 * Text, vector, and hybrid search interface with modern styling
 */

import { useSessionStore } from "../store/sessionStore";

interface SearchPanelProps {
  onJumpToChunk: (chunkId: string) => void;
}

export function SearchPanel({ onJumpToChunk }: SearchPanelProps) {
  const {
    searchQuery,
    setSearchQuery,
    searchMode,
    setSearchMode,
    embeddingModel,
    searchHits,
    isSearching,
    executeSearch,
    selectChunk,
  } = useSessionStore();

  const handleSearch = () => {
    executeSearch().catch(console.error);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleHitClick = (chunkId: string) => {
    selectChunk(chunkId);
    onJumpToChunk(chunkId);
  };

  return (
    <div className="p-4 overflow-auto max-h-[45%]">
      <div className="flex items-center gap-2 mb-3">
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
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <h3 className="text-sm font-semibold text-slate-700">Search</h3>
      </div>

      <div className="flex flex-col gap-3">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search chunks..."
            className="w-full pl-3 pr-10 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 bg-white placeholder-slate-400"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-40 transition-colors"
          >
            {isSearching ? (
              <svg
                className="w-4 h-4 animate-spin"
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
            )}
          </button>
        </div>

        {/* Search Options */}
        <div className="flex gap-2 flex-wrap">
          <select
            value={searchMode}
            onChange={(e) =>
              setSearchMode(e.target.value as "text" | "vector" | "hybrid")
            }
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="text">Text (BM25)</option>
            <option value="vector">Vector (kNN)</option>
            <option value="hybrid">Hybrid</option>
          </select>

          {(searchMode === "vector" || searchMode === "hybrid") && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-600"
              title={embeddingModel}
            >
              <svg
                className="w-3.5 h-3.5 text-slate-400"
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
              {embeddingModel}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="mt-4">
        {searchHits.length > 0 ? (
          <div className="space-y-2">
            {searchHits.map((hit) => (
              <div
                key={`${hit.chunk_id}-${hit.rank}`}
                onClick={() => handleHitClick(hit.chunk_id)}
                className="p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex items-center justify-center w-5 h-5 bg-slate-100 rounded text-[10px] font-bold text-slate-600">
                    {hit.rank}
                  </span>
                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-medium">
                    {hit.score.toFixed(3)}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {hit.chunk_id}
                  </span>
                  <span className="ml-auto text-[10px] text-slate-400">
                    P{hit.page_no}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 group-hover:text-slate-800">
                  {hit.text_snippet}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <svg
              className="w-8 h-8 mb-2"
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
            <p className="text-sm">
              {searchQuery ? "No results found" : "Enter a query to search"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
