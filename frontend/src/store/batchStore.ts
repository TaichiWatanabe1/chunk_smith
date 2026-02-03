/**
 * Batch Store (Zustand)
 * State management for batch/folder operations
 */

import { create } from "zustand";
import type {
  BatchFileInfo,
  JobStatusResponse,
  BatchResponse,
} from "../types/dtos";
import * as batchesApi from "../api/batches";
import * as sessionsApi from "../api/sessions";
import * as jobsApi from "../api/jobs";
import { filterPdfs } from "../utils/fileFilters";

interface BatchState {
  // Batch data
  batchId: string | null;
  batchName: string | null;
  files: BatchFileInfo[];

  // Selection
  selectedSessionId: string | null;

  // Commit jobs
  commitJobIds: string[];
  commitJobStatuses: Record<string, JobStatusResponse>;
  isCommitting: boolean;
  // Poll control
  pollTimerId: number | null;

  // Loading states
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  // Actions
  uploadFolder: (files: File[], batchName?: string) => Promise<void>;
  // Upload a single JSONL file as a batch (does not filter by PDF)
  uploadJsonl: (file: File, batchName?: string) => Promise<BatchResponse>;
  addFiles: (files: File[]) => Promise<void>;
  loadBatch: (batchId: string) => Promise<void>;
  selectFile: (sessionId: string | null) => void;
  commitAll: (embeddingModel: string, indexName?: string) => Promise<void>;
  commitSingle: (
    sessionId: string,
    embeddingModel: string,
    indexName?: string,
  ) => Promise<void>;
  pollCommitJobs: () => void;
  updateFileStatus: (sessionId: string, status: string) => void;
  clearBatch: () => void;
  clearError: () => void;
}

export const useBatchStore = create<BatchState>((set, get) => ({
  // Initial state
  batchId: null,
  batchName: null,
  files: [],
  selectedSessionId: null,
  commitJobIds: [],
  commitJobStatuses: {},
  isCommitting: false,
  pollTimerId: null,
  isLoading: false,
  isUploading: false,
  error: null,

  // Actions
  uploadFolder: async (files: File[], batchName?: string) => {
    set({ isUploading: true, error: null });
    try {
      // Filter PDF files only (use shared util)
      const pdfFiles = filterPdfs(files);

      if (pdfFiles.length === 0) {
        throw new Error("No PDF files found in selection");
      }

      const batch = await batchesApi.createBatch(pdfFiles, batchName);
      set({
        batchId: batch.batch_id,
        batchName: batch.name,
        files: batch.files,
        isUploading: false,
        // Auto-select first ready file
        selectedSessionId:
          batch.files.find((f) => f.session_id)?.session_id || null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to upload folder";
      set({ error: message, isUploading: false });
      throw error;
    }
  },

  uploadJsonl: async (file: File, batchName?: string) => {
    set({ isUploading: true, error: null });
    try {
      const batch = await batchesApi.createBatch([file], batchName);
      console.log("batchStore.uploadJsonl: createBatch response:", batch);
      set({
        batchId: batch.batch_id,
        batchName: batch.name,
        files: batch.files,
        isUploading: false,
        selectedSessionId:
          batch.files.find((f) => f.session_id)?.session_id || null,
      });
      return batch;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to upload file";
      set({ error: message, isUploading: false });
      throw error;
    }
  },

  addFiles: async (files: File[]) => {
    const { batchId } = get();
    if (!batchId) {
      throw new Error("No active batch to add files to");
    }

    set({ isUploading: true, error: null });
    try {
      // Filter PDF files only (use shared util)
      const pdfFiles = filterPdfs(files);

      if (pdfFiles.length === 0) {
        throw new Error("No PDF files found in selection");
      }

      const batch = await batchesApi.addFilesToBatch(batchId, pdfFiles);
      set({
        files: batch.files,
        isUploading: false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add files";
      set({ error: message, isUploading: false });
      throw error;
    }
  },

  loadBatch: async (batchId: string) => {
    set({ isLoading: true, error: null });
    try {
      const batch = await batchesApi.getBatch(batchId);
      set({
        batchId: batch.batch_id,
        batchName: batch.name,
        files: batch.files,
        isLoading: false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load batch";
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  selectFile: (sessionId: string | null) => {
    set({ selectedSessionId: sessionId });
  },

  commitAll: async (embeddingModel: string, indexName?: string) => {
    const { batchId, files } = get();
    if (!batchId) return;

    set({ isCommitting: true, error: null });
    try {
      const response = await batchesApi.commitBatch(batchId, {
        embedding_model: embeddingModel,
        index_name: indexName,
      });

      // Update files with job_id from response
      const updatedFiles = files.map((file) => {
        const jobId = Object.entries(response.job_session_map).find(
          ([, sessionId]) => sessionId === file.session_id,
        )?.[0];
        if (jobId) {
          return { ...file, job_id: jobId, status: "committing" as const };
        }
        return file;
      });

      set({
        commitJobIds: response.job_ids,
        files: updatedFiles,
      });
      // Start polling
      get().pollCommitJobs();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to commit batch";
      set({ error: message, isCommitting: false });
      throw error;
    }
  },

  // Commit a single session but surface progress in the batch Files UI.
  commitSingle: async (
    sessionId: string,
    embeddingModel: string,
    indexName?: string,
  ) => {
    set({ isCommitting: true, error: null });
    try {
      // Use sessions API to create a job for this session
      const response = await sessionsApi.commit(
        sessionId,
        embeddingModel,
        indexName,
      );
      const jobId = response.job_id;

      const { batchId, files } = get();

      if (batchId) {
        // If there is an active batch, attach job to matching file
        const updatedFiles = files.map((file) =>
          file.session_id === sessionId
            ? { ...file, job_id: jobId, status: "committing" as const }
            : file,
        );
        set({
          files: updatedFiles,
          commitJobIds: [...get().commitJobIds, jobId],
        });
      } else {
        // No active batch: create a temporary single-file batch to show progress
        const pseudoFile: BatchFileInfo = {
          filename: sessionId,
          session_id: sessionId,
          status: "committing",
          job_id: jobId,
        };
        set({
          batchId: `single-${sessionId}`,
          batchName: `Single-${sessionId}`,
          files: [pseudoFile],
          selectedSessionId: sessionId,
          commitJobIds: [jobId],
        });
      }

      // Start polling using existing batch poller which updates file statuses
      get().pollCommitJobs();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to commit session";
      set({ error: message, isCommitting: false });
      throw error;
    }
  },

  pollCommitJobs: () => {
    const { commitJobIds } = get();
    if (commitJobIds.length === 0) {
      set({ isCommitting: false });
      return;
    }
    // Prevent creating multiple pollers
    if (get().pollTimerId) return;

    // Reserve a sentinel to avoid races while creating the interval
    set({ pollTimerId: -1 });

    let running = false;
    const intervalId = window.setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const { commitJobIds: currentJobIds, files } = get();
        const statuses: Record<string, JobStatusResponse> = {};
        let allDone = true;

        for (const jobId of currentJobIds) {
          try {
            const status = await jobsApi.getJob(jobId);
            statuses[jobId] = status;
            if (status.status === "queued" || status.status === "running") {
              allDone = false;
            }
          } catch {
            // Job may have been cleaned up
          }
        }

        set({ commitJobStatuses: statuses });

        // Update file statuses based on job statuses
        const updatedFiles = files.map((file) => {
          if (file.job_id && statuses[file.job_id]) {
            const jobStatus = statuses[file.job_id];
            if (jobStatus.status === "succeeded") {
              return { ...file, status: "committed" as const };
            } else if (jobStatus.status === "failed") {
              return {
                ...file,
                status: "error" as const,
                error: "Commit failed",
              };
            } else if (jobStatus.status === "running") {
              return { ...file, status: "committing" as const };
            }
          }
          return file;
        });
        set({ files: updatedFiles });

        if (allDone) {
          window.clearInterval(intervalId);
          set({ isCommitting: false, pollTimerId: null });
        }
      } finally {
        running = false;
      }
    }, 1000);

    set({ pollTimerId: intervalId });
  },

  updateFileStatus: (sessionId: string, status: string) => {
    const { files } = get();
    const updatedFiles = files.map((f) =>
      f.session_id === sessionId
        ? { ...f, status: status as BatchFileInfo["status"] }
        : f,
    );
    set({ files: updatedFiles });
  },

  clearBatch: () => {
    const { pollTimerId } = get();
    if (typeof pollTimerId === "number" && pollTimerId > 0) {
      window.clearInterval(pollTimerId);
    }
    set({
      batchId: null,
      batchName: null,
      files: [],
      selectedSessionId: null,
      commitJobIds: [],
      commitJobStatuses: {},
      isCommitting: false,
      pollTimerId: null,
      error: null,
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));
