# ChunkSmith Frontend

PDF Chunking & Embedding Tool - React + TypeScript + Vite

## Setup

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Create a `.env.local` file (optional, for development):

```
VITE_API_BASE=http://localhost:8000
```

If running with `vite dev`, the proxy will automatically forward `/api` requests to the backend.

## Development

```bash
npm run dev
```

The app will be available at http://localhost:3000

## Docker (Dev)

From repo root:

```bash
docker compose up --build
```

## Build

```bash
npm run build
```

## Project Structure

```
frontend/
  src/
    main.tsx              # Entry point
    App.tsx               # Main app component
    App.css               # Global styles
    routes.tsx            # React Router configuration
    pages/
      UploadPage.tsx      # PDF upload page
      EditorPage.tsx      # Main editor page
    components/
      SessionHeader.tsx   # Session metadata display
      ChunkStrategyPanel.tsx  # Chunking parameters
      FullTextEditor.tsx  # Monaco editor with decorations
      ChunkTree.tsx       # Page/chunk hierarchy
      ChunkDetailPanel.tsx    # Chunk details & metadata
      SearchPanel.tsx     # Search interface
      # JobPanel.tsx removed; commit progress shown per-file in FileListPanel
    api/
      client.ts           # Base API client
      sessions.ts         # Sessions API
      chunks.ts           # Chunks API
      search.ts           # Search API
      jobs.ts             # Jobs API
      embedding.ts        # Embedding models API
    store/
      sessionStore.ts     # Zustand state management
    types/
      dtos.ts             # TypeScript types
    utils/
      debounce.ts         # Debounce utility
      lineStarts.ts       # Offset-to-position conversion
      groupChunks.ts      # Chunk grouping utilities
```

## Features

- **PDF Upload**: Upload PDF files and create editing sessions
- **Full Text Editing**: Monaco editor with syntax highlighting
- **Page Boundaries (Blue)**: Visual markers for page breaks
- **Chunk Boundaries (Red)**: Visual markers for chunk divisions
- **Chunk Strategy**: Adjust chunk size, overlap, and split mode
- **Chunk Tree**: Hierarchical view of pages and chunks
- **Chunk Details**: View and edit chunk metadata
- **Search**: Text, vector, and hybrid search
- **Commit**: Generate embeddings and index to OpenSearch
- **Job Progress**: Real-time commit progress tracking

## Environment Variables

| Variable        | Description          | Default                  |
| --------------- | -------------------- | ------------------------ |
| `VITE_API_BASE` | Backend API base URL | `""` (empty, uses proxy) |
