/**
 * Jobs API
 */

import { request } from "./client";
import type { JobStatusResponse } from "../types/dtos";

/**
 * Get job status and progress
 */
export async function getJob(jobId: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`/api/jobs/${jobId}`);
}
