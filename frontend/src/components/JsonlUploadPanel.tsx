/**
 * JSONL Upload Panel
 * Import pre-chunked data from JSONL files
 */

import { useRef, useState } from "react";
import { previewJsonl } from "../api/sessions";
import { useBatchStore } from "../store/batchStore";
import { ApiError } from "../api/client";
import type { JSONLPreviewResponse } from "../types/dtos";

export interface JsonlUploadPanelProps {
  // Now returns a batch_id instead of a session_id
  onUploaded: (batchId: string) => void;
  onCancel?: () => void;
}

export function JsonlUploadPanel({
  onUploaded,
  onCancel,
}: JsonlUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docId, setDocId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<JSONLPreviewResponse | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setPreview(null);
      await loadPreview(file);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (
      file &&
      (file.name.toLowerCase().endsWith(".jsonl") ||
        file.name.toLowerCase().endsWith(".ndjson"))
    ) {
      setSelectedFile(file);
      setError(null);
      setPreview(null);
      await loadPreview(file);
    }
  };

  const loadPreview = async (file: File) => {
    setIsLoading(true);
    try {
      const result = await previewJsonl(file, docId.trim() || undefined);
      if (result.error) {
        setError(result.error);
        setPreview(null);
      } else {
        setPreview(result);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { detail?: string };
        setError(body?.detail || `Error ${err.status}: ${err.statusText}`);
      } else {
        setError("Failed to preview file");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const { uploadJsonl } = useBatchStore();

  const handleImport = async () => {
    if (!selectedFile) {
      setError("Please select a JSONL file");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const name = docId.trim() || selectedFile.name;
      const batch = await uploadJsonl(selectedFile, name);
      console.log("JsonlUploadPanel: uploadJsonl response:", batch);
      onUploaded(batch.batch_id);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { detail?: string };
        setError(body?.detail || `Error ${err.status}: ${err.statusText}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Import failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* File Drop Zone */}
      <div>
        <input
          ref={fileInputRef}
          id="jsonl-file-input"
          type="file"
          accept=".jsonl,.ndjson"
          onChange={handleFileChange}
          disabled={isLoading}
          className="hidden"
        />
        <label
          htmlFor="jsonl-file-input"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
            isDragging
              ? "border-purple-400 bg-purple-50"
              : selectedFile
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 hover:border-purple-400 hover:bg-purple-50/50"
          } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {selectedFile ? (
            <>
              <div className="w-12 h-12 mb-3 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-emerald-600"
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
              </div>
              <span className="text-sm font-medium text-slate-700">
                {selectedFile.name}
              </span>
              <span className="text-xs text-slate-400 mt-1">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </span>
            </>
          ) : (
            <>
              <div className="w-12 h-12 mb-3 bg-purple-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-purple-600"
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
              </div>
              <span className="text-sm font-medium text-slate-700">
                Drop JSONL or click to browse
              </span>
              <span className="text-xs text-slate-400 mt-1">
                Pre-chunked data in JSONL format
              </span>
            </>
          )}
        </label>
      </div>

      {/* Preview */}
      {preview && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Preview ({preview.total_chunks} chunks)
              </span>
              {preview.doc_ids.length > 0 && (
                <span className="text-xs text-slate-500">
                  {preview.doc_ids.length} doc(s)
                </span>
              )}
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {preview.preview.map((chunk, idx) => (
              <div
                key={idx}
                className="px-4 py-2 border-b border-slate-100 last:border-0"
              >
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <span>#{chunk.line_no}</span>
                  {chunk.doc_id && (
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                      {chunk.doc_id}
                    </span>
                  )}
                  <span>{chunk.char_len} chars</span>
                </div>
                <div className="text-sm text-slate-700 truncate">
                  {chunk.text_preview}
                </div>
                {Object.keys(chunk.metadata).length > 0 && (
                  <div className="text-xs text-slate-400 mt-1">
                    metadata:{" "}
                    {Object.entries(chunk.metadata)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                      .join(", ")}
                    {Object.keys(chunk.metadata).length > 3 && " ..."}
                  </div>
                )}
              </div>
            ))}
          </div>
          {preview.warnings.length > 0 && (
            <div className="bg-amber-50 px-4 py-2 border-t border-amber-200">
              <div className="text-xs text-amber-700">
                ⚠ {preview.warnings.length} warning(s):{" "}
                {preview.warnings.slice(0, 2).join(", ")}
                {preview.warnings.length > 2 && " ..."}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Doc ID Input */}
      <div>
        <label
          htmlFor="jsonl-doc-id"
          className="block text-sm font-medium text-slate-600 mb-2"
        >
          Document ID (optional)
        </label>
        <input
          id="jsonl-doc-id"
          type="text"
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
          placeholder="Default: filename"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
          disabled={isLoading}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 font-medium text-sm"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleImport}
          disabled={isLoading || !selectedFile || !preview}
          className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
            isLoading || !selectedFile || !preview
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
          }`}
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
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
              Processing...
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Import {preview?.total_chunks || 0} Chunks
            </>
          )}
        </button>
      </div>

      {/* Format Help */}
      <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded-lg">
        <div className="font-medium mb-1">JSONL Format:</div>
        <code className="block text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
          {'{"text": "chunk content", "doc_id": "optional", "metadata": {...}}'}
        </code>
      </div>
    </div>
  );
}
