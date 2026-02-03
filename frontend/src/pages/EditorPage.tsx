/**
 * Editor Page
 * Main editing interface for a session
 * Modern UI with improved layout and interactions
 */

import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSessionStore } from "../store/sessionStore";
import { useBatchStore } from "../store/batchStore";
import { EditorHeader } from "../components/editor/EditorHeader";
import {
  FullTextEditor,
  FullTextEditorRef,
} from "../components/FullTextEditor";
import { ChunkTree } from "../components/ChunkTree";
import { ChunkDetailPanel } from "../components/ChunkDetailPanel";
// Footer job UI moved: progress for commits is shown in Files tab
import { FileListPanel } from "../components/FileListPanel";
import {
  getEmbeddingModels,
  getEmbeddingModelsWithDimensions,
} from "../api/embedding";
import { listIndices } from "../api/indices";
import { JsonlUploadPanel } from "../components/JsonlUploadPanel";
import { PdfOrFolderUploadPanel } from "../components/PdfOrFolderUploadPanel";
import type { IndexInfo, EmbeddingModelInfo } from "../types/dtos";

type LeftPaneTab = "files" | "chunks";
type UploadTab = "pdf" | "jsonl";
type IndexSelection = "auto" | "existing" | "new";

export function EditorPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const editorRef = useRef<FullTextEditorRef>(null);
  const [embeddingModels, setEmbeddingModels] = useState<string[]>([]);
  const [, setIsUploadOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<UploadTab>("pdf");
  const [leftTab, setLeftTab] = useState<LeftPaneTab>("files");

  // Index selection state
  const [indices, setIndices] = useState<IndexInfo[]>([]);
  const [indexSelection, setIndexSelection] = useState<IndexSelection>("auto");
  const [selectedIndex, setSelectedIndex] = useState<string>("");
  const [newIndexName, setNewIndexName] = useState<string>("");
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [modelDimensions, setModelDimensions] = useState<EmbeddingModelInfo[]>(
    [],
  );

  // Session store
  const {
    sessionId: storeSessionId,
    loadSession,
    isLoading,
    error,
    clearError,
    resetSession,
    embeddingModel,
    setEmbeddingModel,
    // commitSession/pollJobStatus/jobId removed; batchStore manages commit jobs
    chunks,
  } = useSessionStore();

  // Batch store
  const {
    batchId,
    files: batchFiles,
    selectedSessionId,
    selectFile,
    commitAll,
    isCommitting,
    clearBatch,
    commitSingle,
  } = useBatchStore();
  const { loadBatch } = useBatchStore();

  // Determine modes
  const isBatchMode = !!batchId;
  const hasSession = !!(sessionId || storeSessionId);

  // Load session on mount or when batch selection changes
  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId).catch(console.error);
    } else if (selectedSessionId && isBatchMode) {
      loadSession(selectedSessionId).catch(console.error);
    } else if (!isBatchMode) {
      resetSession();
    }
  }, [sessionId, selectedSessionId, isBatchMode, loadSession, resetSession]);

  // Load embedding models
  useEffect(() => {
    getEmbeddingModels()
      .then((models) => {
        setEmbeddingModels(models);
        // Set first model as default if not already set
        if (models.length > 0 && !embeddingModel) {
          setEmbeddingModel(models[0]);
        }
      })
      .catch(console.error);
  }, [embeddingModel, setEmbeddingModel]);

  // Load indices when commit modal opens
  useEffect(() => {
    if (isCommitModalOpen) {
      // Load both indices and model dimensions in parallel
      Promise.all([listIndices(), getEmbeddingModelsWithDimensions()])
        .then(([indicesResponse, dimensionsResponse]) => {
          setIndices(indicesResponse.indices);
          // getEmbeddingModelsWithDimensions() returns an array of models
          setModelDimensions(dimensionsResponse);
        })
        .catch(console.error);
    }
  }, [isCommitModalOpen]);

  // Get current model's dimension
  const getCurrentModelDimension = (): number | undefined => {
    const modelInfo = modelDimensions.find((m) => m.model === embeddingModel);
    return modelInfo?.dimension;
  };

  // Filter indices by current model's dimension
  const getCompatibleIndices = (): IndexInfo[] => {
    const currentDimension = getCurrentModelDimension();
    if (currentDimension === undefined) {
      return []; // No dimension info available
    }
    return indices.filter((index) => index.dimension === currentDimension);
  };

  // Handle chunk jump
  const handleJumpToChunk = (chunkId: string) => {
    editorRef.current?.jumpToChunk(chunkId);
  };

  // Handle offset jump
  const handleJumpToOffset = (start: number, end: number) => {
    editorRef.current?.jumpToRange(start, end);
  };

  // Get effective index name based on selection
  const getEffectiveIndexName = (): string | undefined => {
    if (indexSelection === "auto") {
      return undefined; // Use auto-generated name
    } else if (indexSelection === "existing") {
      return selectedIndex || undefined;
    } else if (indexSelection === "new") {
      return newIndexName.trim() || undefined;
    }
    return undefined;
  };

  // Open commit modal
  const openCommitModal = () => {
    setIsCommitModalOpen(true);
  };

  // Handle commit (single file)
  const handleCommit = async () => {
    try {
      const indexName = getEffectiveIndexName();
      // Route single-file commit through batchStore to surface progress in Files tab
      const sid = storeSessionId || sessionId;
      if (sid) {
        await commitSingle(sid, embeddingModel, indexName);
      }
      setIsCommitModalOpen(false);
      // Reset selection
      setIndexSelection("auto");
      setSelectedIndex("");
      setNewIndexName("");
    } catch (err) {
      console.error("Commit failed:", err);
    }
  };

  // Handle commit all (batch)
  const handleCommitAll = async () => {
    try {
      const indexName = getEffectiveIndexName();
      await commitAll(embeddingModel, indexName);
      setIsCommitModalOpen(false);
      // Reset selection
      setIndexSelection("auto");
      setSelectedIndex("");
      setNewIndexName("");
    } catch (err) {
      console.error("Batch commit failed:", err);
    }
  };

  // Note: single-session upload flow is deprecated; uploads are routed to batch flow.

  // Handle batch uploaded (used by JSONL uploads)
  const handleBatchUploaded = async (newBatchId: string) => {
    setIsUploadOpen(false);
    try {
      await loadBatch(newBatchId);
      setLeftTab("files");
    } catch (err) {
      console.error("Failed to load batch:", err);
    }
  };

  const handlePdfBatchCreated = () => {
    setIsUploadOpen(false);
    setLeftTab("files");
  };

  // Handle batch file selection
  const handleSelectFile = (sid: string) => {
    selectFile(sid);
    setLeftTab("chunks");
  };

  // Handle batch upload complete (handled by `handleBatchUploaded` below when a batch_id is returned)

  // Clear batch mode (Exit Batch)
  const handleExitBatch = () => {
    clearBatch();
    resetSession();
    navigate("/");
  };

  // Add PDF to batch (opens upload modal)
  const handleAddPdfToBatch = () => {
    setIsUploadOpen(true);
  };

  // Count batch stats
  const readyCount = batchFiles.filter((f) => f.status === "ready").length;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">Loading session...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center border border-slate-200">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-500"
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
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">
            Something went wrong
          </h2>
          <p className="text-slate-500 mb-6">{error}</p>
          <button
            onClick={clearError}
            className="px-6 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* Header */}
      <EditorHeader
        hasSession={hasSession}
        embeddingModels={embeddingModels}
        embeddingModel={embeddingModel}
        setEmbeddingModel={setEmbeddingModel}
        isCommitting={isCommitting}
        isBatchMode={isBatchMode}
        readyCount={readyCount}
        openCommitModal={openCommitModal}
      />

      {/* Commit Modal */}
      {isCommitModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsCommitModalOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">
                Commit to OpenSearch
              </h2>
              <button
                onClick={() => setIsCommitModalOpen(false)}
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

            <div className="space-y-4">
              {/* Embedding Model */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Embedding Model
                </label>
                <select
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  {embeddingModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>

              {/* Index Selection Mode */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">
                  Target Index
                </label>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setIndexSelection("auto")}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                      indexSelection === "auto"
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    onClick={() => setIndexSelection("existing")}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                      indexSelection === "existing"
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    Existing
                  </button>
                  <button
                    onClick={() => setIndexSelection("new")}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                      indexSelection === "new"
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    New
                  </button>
                </div>

                {indexSelection === "auto" && (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                    Index name will be auto-generated based on embedding model.
                  </p>
                )}

                {indexSelection === "existing" && (
                  <div>
                    {(() => {
                      const compatibleIndices = getCompatibleIndices();
                      const currentDimension = getCurrentModelDimension();
                      if (currentDimension === undefined) {
                        return (
                          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                            Loading dimension information...
                          </p>
                        );
                      }
                      if (compatibleIndices.length === 0) {
                        return (
                          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                            No existing indices found with {currentDimension}{" "}
                            dimensions (matching {embeddingModel}).
                          </p>
                        );
                      }
                      return (
                        <select
                          value={selectedIndex}
                          onChange={(e) => setSelectedIndex(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        >
                          <option value="">Select an index...</option>
                          {compatibleIndices.map((idx) => (
                            <option key={idx.index_name} value={idx.index_name}>
                              {idx.index_name} ({idx.doc_count} docs,{" "}
                              {idx.dimension}d)
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                )}

                {indexSelection === "new" && (
                  <div>
                    <input
                      type="text"
                      value={newIndexName}
                      onChange={(e) => setNewIndexName(e.target.value)}
                      placeholder="Enter index name (leave empty for auto)"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      Leave empty to use auto-generated name.
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsCommitModalOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={
                    isBatchMode && readyCount > 0
                      ? handleCommitAll
                      : handleCommit
                  }
                  disabled={
                    (indexSelection === "existing" &&
                      (!selectedIndex ||
                        getCompatibleIndices().length === 0)) ||
                    isCommitting
                  }
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isCommitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : isBatchMode && readyCount > 0 ? (
                    <>Commit All ({readyCount})</>
                  ) : (
                    <>Commit</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm">
          {/* Tab Switcher */}
          <div className="flex p-2 gap-1 border-b border-slate-100">
            <button
              onClick={() => setLeftTab("files")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                leftTab === "files"
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
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
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              Files
              {isBatchMode && (
                <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full">
                  {batchFiles.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setLeftTab("chunks")}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                leftTab === "chunks"
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
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
                  d="M4 6h16M4 10h16M4 14h16M4 18h16"
                />
              </svg>
              Chunks
              {hasSession && chunks.length > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full">
                  {chunks.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {leftTab === "files" ? (
              isBatchMode ? (
                <FileListPanel
                  onSelectFile={handleSelectFile}
                  onExitBatch={handleExitBatch}
                  onAddPdf={handleAddPdfToBatch}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                    <svg
                      className="w-8 h-8 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-slate-500 text-sm">No batch loaded</p>
                  <p className="text-slate-400 text-xs mt-1">
                    Upload a folder to start batch processing
                  </p>
                </div>
              )
            ) : hasSession ? (
              <ChunkTree
                onJumpToChunk={handleJumpToChunk}
                onJumpToOffset={handleJumpToOffset}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                  <svg
                    className="w-8 h-8 text-slate-400"
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
                <p className="text-slate-500 text-sm">No document selected</p>
                <p className="text-slate-400 text-xs mt-1">
                  Upload a PDF to see chunks
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* Center: Editor */}
        <section className="flex-1 bg-white flex flex-col min-w-0">
          {hasSession ? (
            <FullTextEditor ref={editorRef} />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-8">
              <div className="w-full max-w-4xl">
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold text-slate-800 mb-2">
                    Welcome to ChunkSmith
                  </h1>
                  <p className="text-slate-500">
                    Upload PDFs to extract, chunk, and embed your documents
                  </p>
                </div>
                <div>
                  {/* Unified PDF / Folder Card */}
                  <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 hover:shadow-xl transition-shadow">
                    <div className="bg-white rounded-2xl shadow-lg p-6 w-full">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-slate-800">
                          Import Data
                        </h2>
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
                        <PdfOrFolderUploadPanel
                          onBatchCreated={handlePdfBatchCreated}
                        />
                      ) : (
                        <JsonlUploadPanel
                          onCancel={() => {}}
                          onUploaded={handleBatchUploaded}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Sidebar: Chunk Details */}
        <aside className="w-96 bg-white border-l border-slate-200 flex flex-col shadow-sm">
          <ChunkDetailPanel />
        </aside>
      </main>

      {/* Footer job panel removed — commit progress surfaced in Files tab */}
    </div>
  );
}
