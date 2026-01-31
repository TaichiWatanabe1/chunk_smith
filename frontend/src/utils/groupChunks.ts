import type { ChildChunk } from "../types/dtos";

/**
 * Group chunks by page number
 * @param chunks Array of ChildChunk objects
 * @returns Map of page_no to array of chunks
 */
export function groupChunksByPage(
  chunks: ChildChunk[],
): Map<number, ChildChunk[]> {
  const grouped = new Map<number, ChildChunk[]>();

  for (const chunk of chunks) {
    const pageChunks = grouped.get(chunk.page_no) || [];
    pageChunks.push(chunk);
    grouped.set(chunk.page_no, pageChunks);
  }

  // Sort chunks within each page by start offset
  for (const [pageNo, pageChunks] of grouped) {
    grouped.set(
      pageNo,
      pageChunks.sort((a, b) => a.start - b.start),
    );
  }

  return grouped;
}

/**
 * Get sorted page numbers from chunks
 * @param chunks Array of ChildChunk objects
 * @returns Sorted array of unique page numbers
 */
export function getPageNumbers(chunks: ChildChunk[]): number[] {
  const pageNumbers = new Set<number>();
  for (const chunk of chunks) {
    pageNumbers.add(chunk.page_no);
  }
  return Array.from(pageNumbers).sort((a, b) => a - b);
}
