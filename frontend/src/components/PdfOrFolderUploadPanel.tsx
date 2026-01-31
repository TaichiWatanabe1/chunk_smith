/**
 * PDF or Folder Upload Panel
 * Unified upload UI: always creates batch (even for single file)
 */

import { useRef, useState } from "react";
import { useBatchStore } from "../store/batchStore";
import { filterPdfs, inferFolderNameFromFiles } from "../utils/fileFilters";

export interface PdfOrFolderUploadPanelProps {
  onBatchCreated?: () => void;
}

// PDF filter and folder name inference moved to ../utils/fileFilters

export function PdfOrFolderUploadPanel({
  onBatchCreated,
}: PdfOrFolderUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const {
    batchId,
    uploadFolder,
    addFiles,
    isUploading,
    error: batchError,
  } = useBatchStore();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [batchName, setBatchName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isBusy = isUploading;
  const effectiveError = error || batchError;
  const isAddMode = !!batchId; // Adding to existing batch

  const clear = () => {
    setSelectedFiles([]);
    setBatchName("");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const applySelection = (files: File[]) => {
    const pdfs = filterPdfs(files);
    setError(null);
    if (pdfs.length === 0) {
      setSelectedFiles([]);
      setError("Please select PDF file(s)");
      return;
    }

    setSelectedFiles(pdfs);

    // Try to infer batch name from folder structure (only for new batch)
    if (!isAddMode) {
      const inferred = inferFolderNameFromFiles(pdfs);
      if (inferred && !batchName) setBatchName(inferred);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    applySelection(files);
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    applySelection(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    applySelection(files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      if (isAddMode) {
        // Add to existing batch
        await addFiles(selectedFiles);
      } else {
        // Create new batch
        await uploadFolder(selectedFiles, batchName.trim() || undefined);
      }
      clear();
      onBatchCreated?.();
    } catch {
      // Error is handled in store
    }
  };

  return (
    <div className="space-y-5">
      {/* Inputs (hidden) */}
      <input
        ref={fileInputRef}
        id="pdf-or-folder-file"
        type="file"
        accept=".pdf"
        multiple
        onChange={handleFileChange}
        disabled={isBusy}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        id="pdf-or-folder-folder"
        type="file"
        // @ts-expect-error webkitdirectory is not in standard types
        webkitdirectory="true"
        multiple
        onChange={handleFolderChange}
        disabled={isBusy}
        className="hidden"
      />

      {/* Drop Zone */}
      <div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-all ${
            isDragging
              ? "border-blue-400 bg-blue-50"
              : selectedFiles.length > 0
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 hover:border-blue-400 hover:bg-blue-50/50"
          } ${isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="w-12 h-12 mb-3 bg-blue-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <span className="text-sm font-medium text-slate-700">
            Drop PDF file(s) here
          </span>
          <span className="text-xs text-slate-400 mt-1">
            {isAddMode
              ? "Files will be added to existing batch"
              : "Files will be added to batch for processing"}
          </span>

          <div className="flex gap-2 mt-4">
            <label
              htmlFor="pdf-or-folder-file"
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                isBusy
                  ? "bg-slate-100 text-slate-400 border-slate-200"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Browse file(s)
            </label>
            <label
              htmlFor="pdf-or-folder-folder"
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                isBusy
                  ? "bg-slate-100 text-slate-400 border-slate-200"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Browse folder
            </label>
          </div>
        </div>
      </div>

      {/* Selection Summary */}
      {selectedFiles.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">
                {selectedFiles.length === 1
                  ? selectedFiles[0].name
                  : `${selectedFiles.length} PDF files`}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700">
                batch
              </span>
            </div>
            <button
              onClick={clear}
              disabled={isBusy}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          <div className="max-h-28 overflow-auto space-y-1.5">
            {selectedFiles.slice(0, 8).map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 text-xs text-slate-600"
                title={file.name}
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="truncate">{file.name}</span>
              </div>
            ))}
            {selectedFiles.length > 8 && (
              <div className="text-xs text-slate-400 pl-5">
                ... and {selectedFiles.length - 8} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch Name (optional) - only for new batch */}
      {selectedFiles.length > 0 && !isAddMode && (
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">
            Batch Name (optional)
          </label>
          <input
            type="text"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="e.g., Project Documents"
            disabled={isBusy}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all"
          />
        </div>
      )}

      {/* Error */}
      {effectiveError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{effectiveError}</p>
        </div>
      )}

      {/* Upload Button */}
      <button
        onClick={handleUpload}
        disabled={selectedFiles.length === 0 || isBusy}
        className="w-full py-3 px-4 font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 bg-violet-600 text-white hover:bg-violet-700"
      >
        {isBusy ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {isAddMode ? "Adding..." : "Uploading..."}
          </>
        ) : (
          <>
            {isAddMode ? "Add " : "Upload "}
            {selectedFiles.length === 1
              ? "File"
              : `${selectedFiles.length} Files`}
          </>
        )}
      </button>
    </div>
  );
}
