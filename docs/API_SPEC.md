**API 概要（詳細版・日本語）**

- ベースパス: `/api`
- 認証: 現状コードベースに認証ミドルウェアは実装されていません。
- ジョブ処理: セッションの Commit 系処理はバックグラウンドジョブ（`create_job` → `save_job` → `run_commit_job` をスレッドで起動）で実行されます。

---

**共通型（主要フィールド）**

- `Session` / `SessionResponse`:
  - `session_id` (string): セッション識別子
  - `doc_id` (string): ドキュメント名/ID
  - `batch_id` (string | null): バッチに属する場合のID
  - `extract_meta` (ExtractMeta): 抽出メタ（`page_count`, `extractor_version` 等）
  - `base_pages` / `current_pages` (RawPage[]): ページごとのテキスト
  - `current_text` (string): ページマーカーを含む全文
  - `page_map` (PageSpan[]): page のオフセット情報
  - `chunk_strategy` (ChunkStrategy): チャンク設定
  - `chunks` (ChildChunk[]): 生成されたチャンク配列
  - `chunk_metadata` (map): チャンク毎の編集メタデータ

- `Batch` / `BatchResponse`:
  - `batch_id`, `name`, `files: BatchFileInfo[]`
  - `BatchFileInfo` は `filename`, `session_id?`, `status` (`pending`|`ready`|`committing`|`committed`|`error`)、`job_id?`, `chunk_count?`, `page_count?`, `error?`

---

## エンドポイント詳細

注: 各エンドポイントのリクエスト/レスポンス型は `server/app/core/models.py` に定義されています。

### Batches（バッチ管理） — `server/app/api/batches.py`

- POST `/api/batches`
  - 用途: 複数 PDF をアップロードして新規バッチを作成する。
  - リクエスト: multipart form-data: `files: UploadFile[]`, optional `batch_name` (Form)
  - 動作: 各 PDF に対してセッションを生成 → ページ抽出 → 正規化（設定により）→ チャンク生成 → `save_session` → `Batch` を保存
  - レスポンス: `BatchResponse`（作成されたバッチ情報と各ファイルの session_id 等）
  - エラー: ファイルサイズ制限（`settings.CHUNKSMITH_MAX_PDF_MB`）超過はそのファイルだけ `error` ステータスで返却、他は処理継続

- GET `/api/batches`
  - 用途: 保存済みバッチ一覧を取得
  - レスポンス: `BatchListResponse`（`batches: BatchResponse[]`）

- GET `/api/batches/{batch_id}`
  - 用途: 指定バッチの詳細を取得（内部で各 session を読み、ファイルの `chunk_count` / `page_count` を更新）
  - レスポンス: `BatchResponse`

- DELETE `/api/batches/{batch_id}`
  - 用途: バッチを削除（セッションファイル自体は残す）
  - レスポンス: `{ deleted: true, batch_id }`

- POST `/api/batches/{batch_id}/files`
  - 用途: 既存バッチへファイルを追加
  - リクエスト: multipart `files: UploadFile[]`
  - 動作: `POST /api/batches` と同様の処理で各 PDF をセッション化し、`batch.files` に追記 → `save_batch`。
  - レスポンス: 更新後の `BatchResponse`

- POST `/api/batches/{batch_id}/commit`
  - 用途: バッチ内の `status == "ready"` なセッションを一括コミット
  - リクエスト: `BatchCommitRequest` (`embedding_model`, optional `index_name`)
  - 動作: 各 ready ファイルについて `create_job` → `save_job` → `run_commit_job` を別スレッドで起動。ファイルの status を `committing` に更新し、job_id を割当。
  - レスポンス: `BatchCommitResponse`（`job_ids`, `job_session_map`, `skipped_files`, `total_jobs`）
  - 備考: スレッドベースの簡易実装のため大量ジョブを同時起動するとリソース競合の可能性あり（将来的にキュー推奨）

- PUT `/api/batches/{batch_id}/files/{session_id}/status`
  - 用途: バッチ内の単一ファイルのステータス更新（外部からの更新やジョブ完了時の更新に使用）
  - パラメータ: `status` (クエリ/フォーム), optional `job_id`
  - レスポンス: `{ updated: true }`

### Sessions（セッション: 単一 PDF / JSONL） — `server/app/api/sessions.py`

- POST `/api/sessions`
  - 用途: 単一 PDF をアップロードしてセッションを作成
  - リクエスト: multipart `file: UploadFile`, optional `doc_id`
  - 動作: PDF 抽出（`extract_pdf_to_pages`）→ `chunk_strategy` を決定 → 正規化（`normalize_pages`）→ `build_text` → `build_page_map` → `chunk_pages` → `save_session`
  - エラー: サイズ超過で `PDFTooLargeError` を送出（API レベルで適切にハンドルされる）
  - レスポンス: `SessionResponse`（全文状態）

- GET `/api/sessions/{session_id}`
  - 用途: セッションの完全な状態を取得
  - レスポンス: `SessionResponse`

- PUT `/api/sessions/{session_id}/text`
  - 用途: 全文 (`current_text`) を置換して再チャンク
  - リクエスト: `UpdateTextRequest` (`version`, `current_text`)
  - 動作: `version` による楽観ロック。ページ再解析 → 必要なら正規化 → `build_page_map`/`chunk_pages` → 保存
  - レスポンス: `UpdateTextResponse`（新バージョン、再計算された `page_map`/`chunks`）

- PUT `/api/sessions/{session_id}/chunk_strategy`
  - 用途: チャンク戦略を変更し再チャンク
  - リクエスト: `UpdateChunkStrategyRequest` (`version`, `chunk_strategy`)
  - レスポンス: `UpdateChunkStrategyResponse`

- POST `/api/sessions/{session_id}/commit`
  - 用途: セッション単体を OpenSearch にコミット（埋め込み生成→bulk インデックス）
  - リクエスト: `CommitRequest` (`embedding_model`, optional `index_name`)
  - 動作: `create_job`/`save_job` → `run_commit_job` をバックグラウンドスレッドで起動
  - レスポンス: `CommitResponse` (`job_id`)

- POST `/api/sessions/jsonl/preview` / `/api/sessions/jsonl`
  - 用途: JSONL によるインポート（各行がチャンク）
  - リクエスト: multipart `file: UploadFile`（JSONL）、optional `doc_id`
  - 動作: `parse_jsonl` により検証・サンプル生成。`/jsonl` は実際に `Session` を生成して保存する

### Chunks（チャンク関連） — `server/app/api/chunks.py`

- GET `/api/sessions/{session_id}/chunks/{chunk_id}`
  - 用途: 指定チャンクの詳細（位置、テキスト、ハッシュ、警告、metadata）を取得
  - レスポンス: `ChunkDetailResponse`

- PUT `/api/sessions/{session_id}/chunks/{chunk_id}/metadata`
  - 用途: チャンクの編集可能メタデータ（`content_type`, `heading_path`, `note`, `quality_flag`, `custom`）を更新
  - リクエスト: `UpdateChunkMetadataRequest`（`ChunkMetadata` と同構造）

### Embedding（埋め込みモデル発見） — `server/app/api/embedding.py`

- GET `/api/embedding/models`
  - 用途: ランタイムで利用可能な埋め込みモデルキー一覧を返す
  - レスポンス: `EmbeddingModelsResponse` (`models: string[]`)
  - 実装: `core.runtime_state.get_embedding_models()` を返す

- GET `/api/embedding/models/dimensions`
  - 用途: 各モデルのベクトル次元を問い合わせて返す
  - 実装: ランタイムのモデル一覧を走査し、各プロバイダの `dimension()` を呼ぶ（失敗したモデルはスキップ）
  - レスポンス: `EmbeddingModelsWithDimensionsResponse` (`models: [{ model, dimension }]`)
  - 注意: 外部 API 呼び出しを伴う場合があり、応答遅延や失敗を許容する実装

### Indices（OpenSearch 管理） — `server/app/api/indices.py`

- GET `/api/indices`
  - 用途: OpenSearch 上のインデックス一覧と統計（ドキュメント数、ストレージサイズ、ベクトル次元、ヘルス）を返す
  - 実装詳細: `opensearch_client._client.cat.indices` を使用。`mappings` を参照して `vector` フィールドの `dimension` を推定。
  - レスポンス: `IndexListResponse` (`indices: IndexInfo[]`)

- GET `/api/indices/{index_name}`
  - 用途: 単一インデックスの統計とマッピング由来の次元情報を返す

- DELETE `/api/indices/{index_name}`
  - 用途: 指定インデックスを削除（破壊的操作）

### Jobs（ジョブ管理） — `server/app/api/jobs.py`

- GET `/api/jobs/{job_id}`
  - 用途: バックグラウンドジョブのステータス/進捗を取得
  - レスポンス: `JobStatusResponse` (`status`, `progress`(0.0-1.0), `total`, `succeeded`, `failed`, `error_samples`)

### Search（検索） — `server/app/api/search.py`

- POST `/api/search`
  - 用途: `text` / `vector` / `hybrid` モードをサポートする統一検索エンドポイント
  - リクエスト: `SearchRequest` (`query`, `mode`, `top_k`, `filters?`, `embedding_model?`, `index_name?`, `vector?`)
  - 動作ハイライト:
    - `index_name` が指定された場合、インデックス名からモデルキーを抽出して使用する（sanitize 比較で既知モデルを検索）
    - `vector` が未指定のときは `get_embedding_provider(embedding_model).embed_texts()` でベクトルを生成
    - クエリビルドは `core.search_builders`（BM25 / KNN / ハイブリッド）を利用
    - 実行は `opensearch_client.search(index_name, query_body)`

---

## ストレージと永続化

- 永続化方式: ファイルベース（JSON）
  - セッション: `settings.CHUNKSMITH_STORAGE_DIR/sessions/{session_id}.json`
  - バッチ: `.../batches/{batch_id}.json`
  - ジョブ: `.../jobs/{job_id}.json`
  - ファイル書き込みは原子置換（temp ファイル → os.replace）で安全に行われる (`_safe_write`)。

## エラーハンドリングと制約

- PDF サイズ制限: `settings.CHUNKSMITH_MAX_PDF_MB` を超える PDF は拒否（単体セッションは例外、バッチは個別ファイルをエラー扱い）
- バージョン競合: `UpdateTextRequest` / `UpdateChunkStrategyRequest` は `version` による楽観ロック（不一致時は `VersionConflictError`）
- 埋め込み次元不一致: `indices` の `dimension` はマッピングに依存するため `null` になることがある。フロントエンドは次元情報が無い場合のフォールバックを考慮する必要あり

## 運用・拡張の注意点（推奨）

- バックグラウンド処理: 現在はスレッド生成ベースの簡易実装。運用負荷やスケールを考えるとキュー（Celery / RQ / Prefect 等）に移行することを推奨
- トランザクション: 現在はファイル単位保存で原子性は部分的。複数ファイルを跨ぐ更新や再実行性を担保するなら DB またはトランザクション機構の導入を検討
- 認証: インデックス削除やコミットは破壊的操作になり得るため適切な権限管理を追加すべき

## よく使うサンプル（curl）

- バッチ作成（multipart）

```bash
curl -X POST "http://localhost:8000/api/batches" -F "files=@/path/to/a.pdf" -F "files=@/path/to/b.pdf" -F "batch_name=ProjectA"
```

- 既存バッチへファイル追加

```bash
curl -X POST "http://localhost:8000/api/batches/<batch_id>/files" -F "files=@/path/to/new.pdf"
```

- バッチ一括コミット（モデル指定）

```bash
curl -X POST "http://localhost:8000/api/batches/<batch_id>/commit" -H "Content-Type: application/json" -d '{"embedding_model":"openai/text-embedding-3-large"}'
```

- ジョブ状況確認

```bash
curl "http://localhost:8000/api/jobs/<job_id>"
```

---

ファイル: `server/app/core/models.py` と `server/app/core/storage.py` を参照して記載しました。必要であれば各レスポンスボディの完全な JSON 例や、フロントエンドが依存するフィールド（`index.dimension` の扱い等）についてさらに具体例を追加します。
