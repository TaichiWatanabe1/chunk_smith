/**
 * File List Panel Component
 * Shows PDFs in a batch with their status - modern styling
 */

import { useBatchStore } from "../store/batchStore";
import type { BatchFileInfo } from "../types/dtos";

interface FileListPanelProps {
  onSelectFile: (sessionId: string) => void;
  onExitBatch?: () => void;
  onAddPdf?: () => void;
}

function StatusBadge({ status }: { status: BatchFileInfo["status"] }) {
  const styles = {
    pending: "bg-slate-100 text-slate-600",
    ready: "bg-blue-50 text-blue-700",
    committing: "bg-amber-50 text-amber-700",
    committed: "bg-emerald-50 text-emerald-700",
    error: "bg-red-50 text-red-700",
  };

  const icons = {
    pending: (
      <svg
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    ready: (
      <svg
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    committing: (
      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
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
    ),
    committed: (
      <svg
        className="w-3 h-3"
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
    ),
    error: (
      <svg
        className="w-3 h-3"
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
    ),
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full font-medium ${styles[status]}`}
    >
      {icons[status]}
      {status}
    </span>
  );
}

export function FileListPanel({
  onSelectFile,
  onExitBatch,
  onAddPdf,
}: FileListPanelProps) {
  const { files, selectedSessionId, batchName, commitJobStatuses } =
    useBatchStore();

  const readyCount = files.filter((f) => f.status === "ready").length;
  const committedCount = files.filter((f) => f.status === "committed").length;

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 mb-2">
          <svg
            className="w-4 h-4 text-violet-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <h3
            className="text-sm font-semibold text-slate-700 truncate"
            title={batchName || "Files"}
          >
            {batchName || "Files"}
          </h3>
          <span className="ml-auto px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-500 font-medium">
            {files.length}
          </span>
        </div>

        <div className="flex gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-blue-600">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            {readyCount} ready
          </span>
          <span className="flex items-center gap-1 text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            {committedCount} committed
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-3">
          {onAddPdf && (
            <button
              onClick={onAddPdf}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add PDF
            </button>
          )}
          {onExitBatch && (
            <button
              onClick={onExitBatch}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
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
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Exit Batch
            </button>
          )}
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto p-3">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
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
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm">No files uploaded</p>
            <p className="text-xs mt-1">Upload a folder to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.filename}
                onClick={() => file.session_id && onSelectFile(file.session_id)}
                className={`
                  flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
                  ${
                    file.session_id === selectedSessionId
                      ? "bg-white border-2 border-blue-400 shadow-sm"
                      : "bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm"
                  }
                  ${!file.session_id ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                <div className="flex-shrink-0">
                  <svg
                    className={`w-8 h-8 ${file.session_id === selectedSessionId ? "text-blue-500" : "text-slate-400"}`}
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
                </div>

                <div className="flex-1 min-w-0">
                  <div
                    className="font-medium text-sm text-slate-700 truncate"
                    title={file.filename}
                  >
                    {file.filename}
                  </div>
                  <div className="flex flex-col gap-2 mt-1">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      {file.page_count && (
                        <span className="flex items-center gap-1">
                          <svg
                            className="w-3 h-3"
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
                          {file.page_count}p
                        </span>
                      )}
                      {file.chunk_count && (
                        <span className="flex items-center gap-1">
                          <svg
                            className="w-3 h-3"
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
                          {file.chunk_count}c
                        </span>
                      )}
                    </div>

                    {/* Per-file progress (if committing and job status available) */}
                    {file.status === "committing" &&
                      file.job_id &&
                      commitJobStatuses[file.job_id] &&
                      (() => {
                        const js = commitJobStatuses[file.job_id];
                        const progress =
                          typeof js.progress === "number" &&
                          typeof js.total === "number" &&
                          js.total > 0
                            ? Math.round((js.progress / js.total) * 100)
                            : undefined;
                        return (
                          <div className="w-full">
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div
                                className="h-2 bg-amber-400"
                                style={{
                                  width:
                                    progress !== undefined
                                      ? `${progress}%`
                                      : "100%",
                                }}
                              />
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1">
                              {progress !== undefined
                                ? `${progress}%`
                                : js.status}
                            </div>
                          </div>
                        );
                      })()}
                  </div>
                </div>

                <StatusBadge status={file.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
