/**
 * Chunk Strategy Panel Component
 * Controls for adjusting chunking parameters with modern styling
 */

import { useState, useEffect } from "react";
import { useSessionStore } from "../store/sessionStore";
import type { ChunkStrategy } from "../types/dtos";

export function ChunkStrategyPanel() {
  const { chunkStrategy, setChunkStrategy, sourceType } = useSessionStore();

  // Local state for form inputs
  const [localStrategy, setLocalStrategy] =
    useState<ChunkStrategy>(chunkStrategy);
  const [isSaving, setIsSaving] = useState(false);

  // JSONL sessions have pre-defined chunks, strategy is read-only
  const isReadOnly = sourceType === "jsonl";

  // Sync local state when store updates
  useEffect(() => {
    setLocalStrategy(chunkStrategy);
  }, [chunkStrategy]);

  // Check if local strategy differs from store
  const hasChanges =
    localStrategy.chunk_size !== chunkStrategy.chunk_size ||
    localStrategy.overlap !== chunkStrategy.overlap ||
    localStrategy.split_mode !== chunkStrategy.split_mode ||
    localStrategy.normalize !== chunkStrategy.normalize;

  const handleChange = (
    field: keyof ChunkStrategy,
    value: number | string | boolean,
  ) => {
    setLocalStrategy((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setChunkStrategy(localStrategy);
    } catch (error) {
      console.error("Failed to save chunk strategy:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLocalStrategy(chunkStrategy);
  };

  // JSONL mode: show read-only badge
  if (isReadOnly) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg">
        <svg
          className="w-4 h-4 text-purple-500"
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
        <span className="text-xs font-medium text-purple-700">
          JSONL Import
        </span>
        <span className="text-xs text-purple-500">(pre-chunked)</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
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
          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
        />
      </svg>

      <div className="flex items-center gap-1">
        <label htmlFor="chunk-size" className="text-xs text-slate-500">
          Size
        </label>
        <input
          id="chunk-size"
          type="number"
          min={100}
          max={10000}
          value={localStrategy.chunk_size}
          onChange={(e) =>
            handleChange("chunk_size", parseInt(e.target.value) || 800)
          }
          className="w-16 px-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        />
      </div>

      <div className="flex items-center gap-1">
        <label htmlFor="overlap" className="text-xs text-slate-500">
          Overlap
        </label>
        <input
          id="overlap"
          type="number"
          min={0}
          max={1000}
          value={localStrategy.overlap}
          onChange={(e) =>
            handleChange("overlap", parseInt(e.target.value) || 0)
          }
          className="w-14 px-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        />
      </div>

      <select
        id="split-mode"
        value={localStrategy.split_mode}
        onChange={(e) => handleChange("split_mode", e.target.value)}
        className="px-2 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
      >
        <option value="chars">chars</option>
        <option value="paragraph">paragraph</option>
        <option value="heading">heading</option>
      </select>

      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={localStrategy.normalize}
          onChange={(e) => handleChange("normalize", e.target.checked)}
          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-xs text-slate-600">Normalize</span>
      </label>

      {/* Save/Reset Buttons */}
      {hasChanges && (
        <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-200">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? "..." : "Apply"}
          </button>
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-md disabled:opacity-50 transition-colors"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
