/**
 * Search API
 */

import { request } from "./client";
import type { SearchRequest, SearchResponse } from "../types/dtos";

/**
 * Search indexed chunks
 */
export async function search(req: SearchRequest): Promise<SearchResponse> {
  return request<SearchResponse>("/api/search", {
    method: "POST",
    body: req,
  });
}
