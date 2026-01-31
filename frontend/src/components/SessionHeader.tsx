/**
 * Session Header Component
 * Displays session metadata with modern styling
 */

import { useSessionStore } from "../store/sessionStore";

export function SessionHeader() {
  const { sessionId, docId, version } = useSessionStore();

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg">
        <svg
          className="w-4 h-4 text-slate-400"
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
        <span
          className="text-sm font-medium text-slate-700 max-w-[200px] truncate"
          title={docId || ""}
        >
          {docId || "Untitled"}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="font-mono" title={sessionId || ""}>
          {sessionId ? `#${sessionId.slice(0, 8)}` : ""}
        </span>
        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-medium">
          v{version}
        </span>
      </div>
    </div>
  );
}
