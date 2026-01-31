import React from "react";
import { PdfOrFolderUploadPanel } from "../PdfOrFolderUploadPanel";
import { JsonlUploadPanel } from "../JsonlUploadPanel";

type UploadTab = "pdf" | "jsonl";

interface Props {
  isUploadOpen: boolean;
  setIsUploadOpen: (v: boolean) => void;
  uploadTab: UploadTab;
  setUploadTab: (t: UploadTab) => void;
  onPdfBatchCreated: () => void;
  onJsonlBatchUploaded: (batchId: string) => void;
}

export function UploadCard({
  isUploadOpen,
  setIsUploadOpen,
  uploadTab,
  setUploadTab,
  onPdfBatchCreated,
  onJsonlBatchUploaded,
}: Props) {
  return (
    <>
      {/* Upload Modal */}
      {isUploadOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsUploadOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">Import Data</h2>
              <button
                onClick={() => setIsUploadOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
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

            {/* Tab Switcher */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-4">
              <button
                onClick={() => setUploadTab("pdf")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                  uploadTab === "pdf"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                PDF
              </button>
              <button
                onClick={() => setUploadTab("jsonl")}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                  uploadTab === "jsonl"
                    ? "bg-white text-purple-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
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
                JSONL
              </button>
            </div>

            {uploadTab === "pdf" ? (
              <PdfOrFolderUploadPanel onBatchCreated={onPdfBatchCreated} />
            ) : (
              <JsonlUploadPanel
                onCancel={() => setIsUploadOpen(false)}
                onUploaded={onJsonlBatchUploaded}
              />
            )}
          </div>
        </div>
      )}

      {/* In-page Upload Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 hover:shadow-xl transition-shadow">
        <div className="bg-white rounded-2xl shadow-lg p-6 w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Import Data</h2>
          </div>

          {/* Tab Switcher */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-4">
            <button
              onClick={() => setUploadTab("pdf")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                uploadTab === "pdf"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              PDF
            </button>
            <button
              onClick={() => setUploadTab("jsonl")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all ${
                uploadTab === "jsonl"
                  ? "bg-white text-purple-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
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
              JSONL
            </button>
          </div>

          {uploadTab === "pdf" ? (
            <PdfOrFolderUploadPanel onBatchCreated={onPdfBatchCreated} />
          ) : (
            <JsonlUploadPanel
              onCancel={() => {}}
              onUploaded={onJsonlBatchUploaded}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default UploadCard;
