# ChunkSmith Hybrid Server

PDF extraction, chunking, and OpenSearch indexing API.

## Features

- PDF upload and text extraction (PyMuPDF)
- Page marker-based full text editing
- Configurable chunking strategies (chars/paragraph/heading)
- Vector embedding via OpenAI-compatible embeddings endpoint (LangChain OpenAIEmbeddings)
- OpenSearch bulk indexing with kNN vector search
- Text, vector, and hybrid search modes
- Background job processing for commits

## Requirements

- Python 3.11+
- uv (Python package manager)
- OpenSearch instance
- An OpenAI-compatible embeddings endpoint (OpenAI API or local server)

## Installation

```bash
cd server
```

This project uses `uv` for virtual environments and dependency installation.

### 1) Install uv

Install uv using an official installation method.

#### macOS / Linux / WSL (recommended: standalone installer)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

If your system doesn't have `curl`:

```bash
wget -qO- https://astral.sh/uv/install.sh | sh
```

#### Windows (recommended: package manager)

WinGet:

```powershell
winget install --id=astral-sh.uv -e
```

Scoop:

```powershell
scoop install main/uv
```

#### Alternative (PyPI)

If installing from PyPI, uv recommends using an isolated environment (e.g. `pipx`):

```bash
pipx install uv
```

Verify installation:

```bash
uv --version
```

Note (WSL): run the Linux installer inside WSL. Avoid installing uv via Windows Python and calling it from WSL.

### 2) Create a virtual environment

```bash
uv venv --python 3.11
```

### 2.5) Activate the virtual environment (recommended)

```bash
source .venv/bin/activate
```

If you don't have Python 3.11 installed yet, you can install it via uv:

```bash
uv python install 3.11
```

### 3) Install dependencies

```bash
uv pip install -r requirements.txt
```

## Environment Variables

You can set these as process environment variables, or create `server/.env` (or `server/.env.local`).
The server will auto-load them at startup when `python-dotenv` is installed.

```bash
# General
CHUNKSMITH_ENV=dev                          # dev or prod
CHUNKSMITH_STORAGE_DIR=./storage            # Storage directory
CHUNKSMITH_MAX_PDF_MB=50                    # Max PDF size
CHUNKSMITH_CORS_ORIGINS=http://localhost:3000

# PDF Extractor
PDF_EXTRACTOR=pymupdf
PDF_EXTRACTOR_VERSION=1.0.0

# Embedding (OpenAI-compatible)
# The server will try to fetch model list on startup. If that fails, it will
# fall back to EMBEDDING_MODELS after a connectivity check.
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
EMBEDDING_MODELS=text-embedding-3-large,text-embedding-3-small

# OpenSearch
OPENSEARCH_HOST=http://opensearch:9200
OPENSEARCH_BASE_INDEX=chunksmith-chunks
OPENSEARCH_BULK_SIZE=200
OPENSEARCH_VERIFY_SSL=false
OPENSEARCH_USERNAME=                        # Optional
OPENSEARCH_PASSWORD=                        # Optional
```

Tip: start from `server/.env.example`.

## Docker (Dev)

From repo root:

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Server API: http://localhost:8000/docs
- OpenSearch: http://localhost:9200

## Running

```bash
# Development
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Note: most settings have defaults in code. If you are not using the default URLs, set at least:

- `OPENSEARCH_HOST`
- `OPENAI_BASE_URL`
- `OPENAI_API_KEY` (required for api.openai.com; local servers may accept any value)

### Start scripts

Two convenience scripts are included to start the server from the `server/` directory.

- [server/start.sh](server/start.sh) — Linux / WSL / macOS (development; uses reload).

  Usage:

  ```bash
  chmod +x server/start.sh
  ./server/start.sh
  ```

- [server/start.ps1](server/start.ps1) — PowerShell (supports `-Mode dev|prod`).

  Usage:

  ```powershell
  # Development (default)
  .\server\start.ps1

  # Production (workers)
  .\server\start.ps1 -Mode prod
  ```

## API Endpoints

### Sessions

- `POST /api/sessions` - Upload PDF and create session
- `GET /api/sessions/{sid}` - Get session state
- `PUT /api/sessions/{sid}/text` - Update full text
- `PUT /api/sessions/{sid}/chunk_strategy` - Update chunking strategy
- `POST /api/sessions/{sid}/commit` - Commit to OpenSearch

### Chunks

- `GET /api/sessions/{sid}/chunks/{chunk_id}` - Get chunk details
- `PUT /api/sessions/{sid}/chunks/{chunk_id}/metadata` - Update chunk metadata

### Search

- `POST /api/search` - Search indexed chunks (text/vector/hybrid)

### Jobs

- `GET /api/jobs/{job_id}` - Get job status

### Embedding

- `GET /api/embedding/models` - List available models

### Health

- `GET /healthz` - Health check

## API Documentation

Swagger UI: http://localhost:8000/docs
ReDoc: http://localhost:8000/redoc
