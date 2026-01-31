/**
 * Chunk Detail Panel Component
 * Displays detailed information about the selected chunk with modern styling
 */

import { useState, useEffect } from "react";
import { useSessionStore } from "../store/sessionStore";
import { getChunkDetail, updateChunkMetadata } from "../api/chunks";
import type { ChunkDetailResponse, ChunkMetadata } from "../types/dtos";

export function ChunkDetailPanel() {
  const { sessionId, selectedChunkId } = useSessionStore();
  const [detail, setDetail] = useState<ChunkDetailResponse | null>(null);
  const [metadata, setMetadata] = useState<ChunkMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load chunk detail when selected chunk changes
  useEffect(() => {
    if (!sessionId || !selectedChunkId) {
      setDetail(null);
      setMetadata(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    getChunkDetail(sessionId, selectedChunkId)
      .then((response) => {
        setDetail(response);
        setMetadata(response.metadata);
      })
      .catch((err) => {
        setError(err.message || "Failed to load chunk details");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [sessionId, selectedChunkId]);

  const handleMetadataChange = (field: keyof ChunkMetadata, value: string) => {
    if (!metadata) return;
    setMetadata({ ...metadata, [field]: value });
  };

  const handleSave = async () => {
    if (!sessionId || !selectedChunkId || !metadata) return;

    setIsSaving(true);
    setError(null);

    try {
      await updateChunkMetadata(sessionId, selectedChunkId, metadata);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save metadata");
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedChunkId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6">
        <svg
          className="w-10 h-10 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
          />
        </svg>
        <p className="text-sm">Select a chunk to view details</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6">
        <svg
          className="w-8 h-8 animate-spin mb-3"
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
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-red-500 p-6">
        <svg
          className="w-10 h-10 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!detail || !metadata) {
    return null;
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
      <div className="flex items-center gap-2 mb-4">
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
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="text-sm font-semibold text-slate-700">Chunk Details</h3>
      </div>

      {/* Info Grid */}
      <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-16">Chunk</span>
          <span className="font-mono text-xs font-medium text-slate-700">
            {detail.chunk_id}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-16">Doc</span>
          <span className="text-xs text-slate-600 break-all">
            {detail.doc_id}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-16">Page</span>
          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
            P{detail.page_no}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-16">Range</span>
          <span className="text-xs text-slate-600">
            {detail.start} – {detail.end}
            <span className="ml-1.5 px-1 py-0.5 bg-slate-200 rounded text-[10px] text-slate-600">
              {detail.char_len}c
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-16">Hash</span>
          <span className="font-mono text-[10px] text-slate-400">
            {detail.hash.slice(0, 16)}...
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-16">Strategy</span>
          <span className="text-xs text-slate-600">
            {detail.chunk_strategy.chunk_size} / {detail.chunk_strategy.overlap}{" "}
            / {detail.chunk_strategy.split_mode}
          </span>
        </div>
        {detail.warnings.length > 0 && (
          <div className="flex items-start gap-2 pt-1 border-t border-slate-200">
            <svg
              className="w-4 h-4 text-amber-500 mt-0.5"
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
            <span className="text-xs text-amber-700">
              {detail.warnings.join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Metadata Form */}
      <div className="border-t border-slate-200 pt-4">
        <h4 className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wide">
          Metadata (editable)
        </h4>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="content-type"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              Content Type
            </label>
            <select
              id="content-type"
              value={metadata.content_type}
              onChange={(e) =>
                handleMetadataChange("content_type", e.target.value)
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
            >
              <option value="body">body</option>
              <option value="table">table</option>
              <option value="bullets">bullets</option>
              <option value="caption">caption</option>
              <option value="other">other</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="heading-path"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              Heading Path
            </label>
            <input
              id="heading-path"
              type="text"
              value={metadata.heading_path}
              onChange={(e) =>
                handleMetadataChange("heading_path", e.target.value)
              }
              placeholder="e.g., Chapter 1 > Section 2"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 placeholder-slate-400"
            />
          </div>

          <div>
            <label
              htmlFor="note"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              Note
            </label>
            <textarea
              id="note"
              value={metadata.note}
              onChange={(e) => handleMetadataChange("note", e.target.value)}
              placeholder="Add notes about this chunk..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 placeholder-slate-400"
            />
          </div>

          <div>
            <label
              htmlFor="quality-flag"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              Quality Flag
            </label>
            <select
              id="quality-flag"
              value={metadata.quality_flag}
              onChange={(e) =>
                handleMetadataChange("quality_flag", e.target.value)
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
            >
              <option value="good">good</option>
              <option value="suspect">suspect</option>
              <option value="broken">broken</option>
            </select>
          </div>

          {/* Custom Metadata (from JSONL) */}
          {metadata.custom && Object.keys(metadata.custom).length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Custom Fields (from JSONL)
              </label>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                {Object.entries(metadata.custom).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start gap-2 text-sm py-1 border-b border-purple-100 last:border-0"
                  >
                    <span className="font-medium text-purple-700 min-w-[80px]">
                      {key}:
                    </span>
                    <span className="text-purple-900 break-all">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <>
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
                Saving...
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Save Metadata
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
