/**
 * Full Text Editor Component
 * Monaco editor with page (blue) and chunk (red) decorations
 * Implements windowing for performance
 */

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useState,
} from "react";
import Editor, { OnMount, OnChange } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useSessionStore } from "../store/sessionStore";
import { debounce } from "../utils/debounce";
import {
  buildLineStarts,
  offsetRangeToRange,
  findPageAtOffset,
} from "../utils/lineStarts";

export interface FullTextEditorRef {
  jumpToRange: (start: number, end: number) => void;
  jumpToChunk: (chunkId: string) => void;
}

export const FullTextEditor = forwardRef<FullTextEditorRef>((_props, ref) => {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const [visiblePage, setVisiblePage] = useState<number>(1);

  const {
    currentText,
    setCurrentText,
    pageMap,
    chunks,
    selectedChunkId,
    selectChunk,
  } = useSessionStore();

  // Build line starts for offset-to-position conversion
  const lineStarts = useMemo(() => buildLineStarts(currentText), [currentText]);

  // Debounced text update
  const debouncedUpdate = useMemo(
    () =>
      debounce((text: string) => {
        setCurrentText(text).catch(console.error);
      }, 500),
    [setCurrentText],
  );

  // Handle editor mount
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Track visible range for windowing
    editor.onDidScrollChange(() => {
      const visibleRanges = editor.getVisibleRanges();
      if (visibleRanges.length > 0) {
        const topLine = visibleRanges[0].startLineNumber;
        // Estimate offset from line number
        const offset = lineStarts[topLine - 1] || 0;
        const page = findPageAtOffset(offset, pageMap);
        if (page > 0 && page !== visiblePage) {
          setVisiblePage(page);
        }
      }
    });
  };

  // Handle text change
  const handleChange: OnChange = (value) => {
    if (value !== undefined && value !== currentText) {
      debouncedUpdate(value);
    }
  };

  // Apply decorations (windowed: visible page ± 1)
  const applyDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !currentText) return;

    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    // Determine which pages to decorate (windowing)
    const minPage = Math.max(1, visiblePage - 1);
    const maxPage = visiblePage + 1;

    // Page boundaries (blue) - full line marker at page start
    for (const page of pageMap) {
      if (page.page_no < minPage || page.page_no > maxPage) continue;

      const range = offsetRangeToRange(page.start, page.start + 1, lineStarts);
      decorations.push({
        range: new monaco.Range(
          range.startLineNumber,
          1,
          range.startLineNumber,
          1,
        ),
        options: {
          isWholeLine: true,
          className: "pageBoundary",
          glyphMarginClassName: "pageGlyph",
          glyphMarginHoverMessage: { value: `Page ${page.page_no}` },
        },
      });
    }

    // Chunk boundaries (red) - highlight range
    for (const chunk of chunks) {
      if (chunk.page_no < minPage || chunk.page_no > maxPage) continue;

      const range = offsetRangeToRange(chunk.start, chunk.end, lineStarts);
      const isSelected = chunk.chunk_id === selectedChunkId;

      decorations.push({
        range: new monaco.Range(
          range.startLineNumber,
          range.startColumn,
          range.endLineNumber,
          range.endColumn,
        ),
        options: {
          className: isSelected ? "chunkSelected" : "chunkBoundary",
          hoverMessage: { value: `Chunk ${chunk.chunk_id}` },
        },
      });
    }

    // Apply decorations
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      decorations,
    );
  }, [currentText, pageMap, chunks, selectedChunkId, visiblePage, lineStarts]);

  // Update decorations when dependencies change
  useEffect(() => {
    applyDecorations();
  }, [applyDecorations]);

  // Expose jump methods via ref
  useImperativeHandle(
    ref,
    () => ({
      jumpToRange: (start: number, end: number) => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;

        const range = offsetRangeToRange(start, end, lineStarts);
        editor.revealRangeInCenter(
          new monaco.Range(
            range.startLineNumber,
            range.startColumn,
            range.endLineNumber,
            range.endColumn,
          ),
        );
        editor.setSelection(
          new monaco.Range(
            range.startLineNumber,
            range.startColumn,
            range.endLineNumber,
            range.endColumn,
          ),
        );
      },
      jumpToChunk: (chunkId: string) => {
        const chunk = chunks.find((c) => c.chunk_id === chunkId);
        if (chunk) {
          selectChunk(chunkId);
          const editor = editorRef.current;
          const monaco = monacoRef.current;
          if (!editor || !monaco) return;

          const range = offsetRangeToRange(chunk.start, chunk.end, lineStarts);
          editor.revealRangeInCenter(
            new monaco.Range(
              range.startLineNumber,
              range.startColumn,
              range.endLineNumber,
              range.endColumn,
            ),
          );
        }
      },
    }),
    [chunks, lineStarts, selectChunk],
  );

  return (
    <div className="h-full">
      <Editor
        height="100%"
        defaultLanguage="plaintext"
        value={currentText}
        onChange={handleChange}
        onMount={handleEditorMount}
        options={{
          readOnly: false,
          wordWrap: "on",
          lineNumbers: "on",
          glyphMargin: true,
          folding: false,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          fontSize: 14,
        }}
      />
    </div>
  );
});

FullTextEditor.displayName = "FullTextEditor";
