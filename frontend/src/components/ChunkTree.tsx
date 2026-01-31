/**
 * Chunk Tree Component
 * Hierarchical view of pages and their chunks with modern styling
 */

import { useMemo, useState } from "react";
import { useSessionStore } from "../store/sessionStore";
import { groupChunksByPage, getPageNumbers } from "../utils/groupChunks";

interface ChunkTreeProps {
  onJumpToChunk: (chunkId: string) => void;
  onJumpToOffset: (start: number, end: number) => void;
}

export function ChunkTree({ onJumpToChunk, onJumpToOffset }: ChunkTreeProps) {
  const { pageMap, chunks, selectedChunkId, selectChunk } = useSessionStore();
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());

  // Group chunks by page
  const groupedChunks = useMemo(() => groupChunksByPage(chunks), [chunks]);
  const pageNumbers = useMemo(() => getPageNumbers(chunks), [chunks]);

  const togglePage = (pageNo: number) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNo)) {
        next.delete(pageNo);
      } else {
        next.add(pageNo);
      }
      return next;
    });
  };

  const handlePageClick = (pageNo: number) => {
    const page = pageMap.find((p) => p.page_no === pageNo);
    if (page) {
      onJumpToOffset(page.start, page.end);
    }
    togglePage(pageNo);
  };

  const handleChunkClick = (chunkId: string) => {
    selectChunk(chunkId);
    onJumpToChunk(chunkId);
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
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
            d="M4 6h16M4 10h16M4 14h16M4 18h16"
          />
        </svg>
        <h3 className="text-sm font-semibold text-slate-700">Chunks</h3>
        <span className="ml-auto text-xs text-slate-400">
          {chunks.length} total
        </span>
      </div>

      <div className="space-y-1">
        {pageNumbers.map((pageNo) => {
          const pageChunks = groupedChunks.get(pageNo) || [];
          const isExpanded = expandedPages.has(pageNo);

          return (
            <div key={pageNo}>
              <div
                onClick={() => handlePageClick(pageNo)}
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-lg hover:bg-slate-100 transition-colors"
              >
                <svg
                  className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                  P{String(pageNo).padStart(3, "0")}
                </span>
                <span className="text-xs text-slate-400">
                  {pageChunks.length} chunks
                </span>
              </div>

              {isExpanded && (
                <div className="ml-4 pl-2 border-l-2 border-slate-100 space-y-0.5 mt-1 mb-2">
                  {pageChunks.map((chunk) => (
                    <div
                      key={chunk.chunk_id}
                      onClick={() => handleChunkClick(chunk.chunk_id)}
                      className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-md transition-all ${
                        chunk.chunk_id === selectedChunkId
                          ? "bg-blue-100 border border-blue-200"
                          : "hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <span
                        className={`font-mono text-xs ${
                          chunk.chunk_id === selectedChunkId
                            ? "text-blue-700"
                            : "text-slate-600"
                        }`}
                      >
                        {chunk.chunk_id}
                      </span>
                      <span className="px-1 py-0.5 bg-slate-100 rounded text-[10px] text-slate-500">
                        {chunk.char_len}c
                      </span>
                      {chunk.warnings.length > 0 && (
                        <span
                          className="ml-auto flex items-center gap-1 text-amber-600"
                          title={chunk.warnings.join(", ")}
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                          </svg>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {pageNumbers.length === 0 && (
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm">No chunks available</p>
          </div>
        )}
      </div>
    </div>
  );
}
