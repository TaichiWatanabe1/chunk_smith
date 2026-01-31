# API 処理フロー（エンドポイント起点）

このドキュメントは `docs/API_SPEC.md` の補足として、各主要エンドポイントを起点にした処理のシーケンス（受信 → 検証 → 内部処理 → 永続化 → バックグラウンド処理 → レスポンス）を詳述します。運用時の障害切り分け、フロントエンドとの契約確認、ログ出力ポイント設計に利用してください。

---

## 1) POST /api/sessions — 単一 PDF のセッション作成

1. 受信
   - FastAPI が multipart `file` を受け取る。エンドポイント: `server/app/api/sessions.py` の `create_session`
2. 検証
   - バイナリ長から MB を計算し `settings.CHUNKSMITH_MAX_PDF_MB` を超える場合は `PDFTooLargeError` を送出（HTTP 4xx/5xx の取り扱いは実装に依存）
3. PDF 抽出
   - `extract_pdf_to_pages(pdf_bytes, settings.PDF_EXTRACTOR_VERSION)` を呼んで `base_pages` と `extract_meta` を取得
4. チャンク戦略決定
   - `ChunkStrategy` を作成（`DEFAULT_CHUNK_SIZE` 等から）
5. 正規化
   - `chunk_strategy.normalize` が真なら `normalize_pages(base_pages)` を実行し `current_pages` を作る
6. テキスト / マップ / チャンク生成
   - `build_text(current_pages)` → `current_text`
   - `build_page_map(current_text, current_pages, doc_id)` → `page_map`
   - `chunk_pages(...)` → `chunks`
7. 永続化
   - `Session` を組み立て `save_session(session)` で `sessions/{session_id}.json` に原子書き込み
8. レスポンス
   - `SessionResponse.from_session(session)` を返す（フロントはこれを受けて UI 表示と状態初期化を行う）

ログ出力推奨ポイント:

- リクエスト受信時（session_id 生成）
- PDF 抽出開始/終了（ページ数、警告）
- チャンク生成完了（チャンク数）
- セッション保存成功/失敗（ファイルパス）

---

## 2) POST /api/batches — バッチ作成（複数 PDF）

1. 受信
   - multipart `files[]` と optional `batch_name` を受け取る。`create_batch` ハンドラが担当
2. バッチ初期化
   - `batch_id = uuid4()`、作成時刻 `now` を確定
3. 各ファイル処理（ループ）
   - ファイル読み込み（非同期 `await upload_file.read()`）
   - サイズ検査 → 超過ならそのファイルに `BatchFileInfo(status='error', error=...)` を追加して次へ
   - 上記の単一セッション作成フロー（抽出→正規化→chunking）を実行
   - 成功したら新規 `Session` を `save_session`、`BatchFileInfo(session_id=..., status='ready', chunk_count=...)` を `batch.files` に追加
   - 失敗時は `BatchFileInfo(status='error', error=...)` を追加
4. バッチ永続化
   - `save_batch(batch)`（`batches/{batch_id}.json` に原子書き込み）
5. レスポンス
   - `BatchResponse.from_batch(batch)` を返す（フロントはこれでバッチ一覧やファイルステータスを表示）

ログ出力推奨ポイント:

- バッチ作成開始（batch_id）
- 各ファイルの処理開始/終了とエラー内容
- バッチ保存成功

---

## 3) POST /api/batches/{batch_id}/files — 既存バッチにファイル追加

1. 受信
   - multipart `files[]`、path `batch_id`
2. バッチ読み込み
   - `batch = load_batch(batch_id)`（存在しない場合は `BatchNotFoundError`）
3. 各ファイルに対する処理
   - 基本は POST /api/batches のファイル処理と同一
   - 生成した `Session` を `save_session`、`batch.files.append(BatchFileInfo(...))`
4. 保存とレスポンス
   - `save_batch(batch)` → `BatchResponse` を返す

---

## 4) POST /api/sessions/{session_id}/commit — セッション単体コミット

1. 受信
   - `CommitRequest` を受け取り `session_id` を確認
2. セッション読み込み
   - `session = load_session(session_id)`
3. ジョブ作成
   - `job_id = uuid4()`、`create_job(...)` でジョブ dict を生成
4. ジョブ永続化
   - `save_job(job)`（`jobs/{job_id}.json`）
5. バックグラウンド起動
   - `threading.Thread(target=run_commit_job, args=(job,), daemon=True).start()`
6. run_commit_job の内部（代表的）
   - ジョブ状態を `running` に更新して保存
   - `provider.embed_texts()` を使ってチャンクのベクトルを作成（必要ならバッチ化）
   - OpenSearch に対して bulk インデックスを行う（失敗時は再試行ロジックや error_samples に記載）
   - 完了時に `succeeded`/`failed` を設定し `save_job` で保存
7. レスポンス
   - `CommitResponse(job_id)` を返す。フロントはポーリングで `/api/jobs/{job_id}` を確認する

ログ出力推奨ポイント:

- job 作成（job_id, session_id）
- run_commit_job 開始/完了/例外（エラーサンプルを含む）

---

## 5) POST /api/batches/{batch_id}/commit — バッチ一括コミット

1. 受信
   - `BatchCommitRequest` を受け取る
2. バッチ読み込み
   - `batch = load_batch(batch_id)`
3. ready ファイルフィルタ
   - `for file_info in batch.files if file_info.status == 'ready'` をループ
4. 各ファイルごとにジョブ作成/永続化/スレッド起動
   - `create_job` → `save_job` → `thread.start()`
   - `file_info.job_id` を記録し `file_info.status = 'committing'`
5. バッチ保存
   - `save_batch(batch)` で更新
6. レスポンス
   - `BatchCommitResponse`（job_ids, job_session_map, skipped_files, total_jobs）

注意:

- 各ジョブで run_commit_job が個別に実行される。サーバが軽量な単一ノードである場合は同時実行数に注意

---

## 6) POST /api/search — 検索フロー

1. 受信
   - `SearchRequest`（mode, query, top_k, filters, embedding_model?, index_name?, vector?）を受け取る
2. index / model 解決
   - `index_name` 指定時は `extract_model_from_index_name(index_name)` でモデルキーを推測
   - 指定がない場合、`get_embedding_models()` を参照して embedding_model を決定
3. ベクトル生成
   - `vector` がなければ `get_embedding_provider(embedding_model).embed_texts([query])` を呼ぶ
4. クエリ構築
   - `build_text_query` / `build_knn_query` / `build_hybrid_query` を使用
5. OpenSearch 実行
   - `opensearch_client.search(index_name, query_body)` を実行し結果を受け取る
6. レスポンス整形
   - `_extract_hits` で `SearchHit[]` に変換し `SearchResponse` を返す

---

## 7) GET /api/indices — インデックス一覧

1. 受信
   - GET リクエストを受ける
2. OpenSearch 呼び出し
   - `client._client.cat.indices(format='json')` で一覧を取得
   - 必要に応じ `client._client.indices.refresh(index='chunksmith-*')` を試行
3. 各インデックスの mapping 取得
   - `get_mapping(index_name)` で `vector` フィールドの `dimension` を抽出
4. レスポンス
   - `IndexListResponse` を返す

---

## 8) GET /api/jobs/{job_id} — ジョブステータス取得

1. 受信
   - GET リクエスト（`job_id`）を受ける
2. ストレージ読み込み
   - `load_job(job_id)` で `jobs/{job_id}.json` を読み込む
3. レスポンス
   - `JobStatusResponse`（status, progress, total, succeeded, failed, error_samples）を返す

---

### 補足: フロントエンドとの契約点（要確認）

- `BatchResponse` 内の `files[].status` と `files[].job_id` はフロントが UI 状態遷移（ready→committing→committed/error）に依存します。
- `IndexInfo.dimension` が `null` の場合のフロント挙動（既存インデックスのフィルタ等）は仕様上明示しておくべきです。

---

このファイルは `docs/API_SPEC.md` の補助ドキュメントとして作成しました。必要なら `API_SPEC.md` 本体にマージします（ファイル末尾のフォーマットの都合で分割しました）。
