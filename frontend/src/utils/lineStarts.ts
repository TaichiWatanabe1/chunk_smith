/**
 * Line starts utility for offset-to-position conversion
 * Used to convert character offsets to Monaco editor positions
 */

/**
 * Build an array of line start offsets
 * @param text The full text
 * @returns Array where index = line number (0-based), value = character offset of line start
 */
export function buildLineStarts(text: string): number[] {
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return lineStarts;
}

/**
 * Convert a character offset to a Monaco position (1-based line and column)
 * @param offset Character offset in the text
 * @param lineStarts Pre-computed line starts array
 * @returns Object with lineNumber and column (both 1-based)
 */
export function offsetToPosition(
  offset: number,
  lineStarts: number[],
): { lineNumber: number; column: number } {
  // Binary search to find the line
  let low = 0;
  let high = lineStarts.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (lineStarts[mid] <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const lineNumber = low + 1; // Monaco is 1-based
  const column = offset - lineStarts[low] + 1; // Monaco is 1-based

  return { lineNumber, column };
}

/**
 * Convert an offset range to a Monaco Range
 * @param start Start offset (inclusive)
 * @param end End offset (exclusive)
 * @param lineStarts Pre-computed line starts array
 * @returns Monaco-compatible range object
 */
export function offsetRangeToRange(
  start: number,
  end: number,
  lineStarts: number[],
): {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
} {
  const startPos = offsetToPosition(start, lineStarts);
  const endPos = offsetToPosition(end, lineStarts);

  return {
    startLineNumber: startPos.lineNumber,
    startColumn: startPos.column,
    endLineNumber: endPos.lineNumber,
    endColumn: endPos.column,
  };
}

/**
 * Find the page number at a given offset using binary search
 * @param offset Character offset
 * @param pageMap Array of PageSpan objects
 * @returns Page number (1-based) or 0 if not found
 */
export function findPageAtOffset(
  offset: number,
  pageMap: Array<{ page_no: number; start: number; end: number }>,
): number {
  if (pageMap.length === 0) return 0;

  let low = 0;
  let high = pageMap.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const page = pageMap[mid];

    if (offset < page.start) {
      high = mid - 1;
    } else if (offset >= page.end) {
      low = mid + 1;
    } else {
      return page.page_no;
    }
  }

  return 0;
}
