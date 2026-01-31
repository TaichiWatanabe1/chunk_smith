# フロントエンド → API 連携フロー（エンドポイント起点）

このドキュメントは、フロントエンド側のユーザー操作を起点に、どのコンポーネント／ストアが呼ばれ、どの API エンドポイントへ到達し、サーバからの応答をどのように扱うかを順序立てて示します。デバッグ、テストケース作成、API 仕様の明確化に利用してください。

各フローは次の形式で記載します：

- ステップ番号: UI 操作 → フロント処理 → API 呼び出し → バックエンド処理（要約）→ フロント更新

---

## 1) 単一 PDF アップロード（セッション作成）

1. ユーザー操作
   - 編集画面のアップロードボタンから PDF を選択して Upload を実行
2. フロント処理
   - アップロード UI（`PdfOrFolderUploadPanel` または専用アップローダ）が `sessions.createSession(file, docId?)` を呼ぶ
   - UI はアップロード中の状態（スピナー）を表示
3. API 呼び出し
   - POST `/api/sessions` (multipart file)
4. バックエンド処理（概略）
   - PDF 抽出 (`extract_pdf_to_pages`) → 正規化（必要時）→ `build_text` → `chunk_pages` → `save_session`
   - 成功すると `SessionResponse` を返却
5. フロント更新
   - `sessionStore`（もしくは呼び出し元）で `loadSession` もしくは直接レスポンスを利用してセッション状態を初期化
   - エディタに全文・チャンク・ページ情報を表示
   - 必要に応じナビゲーション（例: `/sessions/{session_id}`）を行う

エラー処理：

- サイズ超過はサーバが `PDFTooLargeError` を返す。フロントはエラーメッセージを表示し、アップロードを中止する。

---

## 2) バッチ作成（複数 PDF → バッチ）

1. ユーザー操作
   - フォルダ選択／複数ファイル選択を行い「Upload」または「Create Batch」を実行
2. フロント処理
   - `PdfOrFolderUploadPanel` が選択ファイルを `batchStore.uploadFolder(files, batchName?)` に渡す
   - `batchStore.uploadFolder` は PDF のフィルタリング後 `batches.createBatch(files, batchName?)` を呼ぶ
3. API 呼び出し
   - POST `/api/batches` (multipart files[], optional batch_name)
4. バックエンド処理（概略）
   - 各 PDF ごとにセッション作成処理を実行（抽出→chunking→save_session）
   - バッチオブジェクトを作成して `save_batch`
   - `BatchResponse` を返却（各ファイルの session_id / status を含む）
5. フロント更新
   - `batchStore` は返却結果を `batchId`, `files`, `selectedSessionId` 等に保存
   - UI はバッチ詳細とファイル一覧を表示、最初の ready ファイルを自動選択

エラー処理：

- 個々のファイルで発生したエラーは `BatchFileInfo.error` に格納され、UI 上で該当ファイルにエラーマークを表示する。

---

## 3) 既存バッチへのファイル追加

1. ユーザー操作
   - バッチ画面で「Add Files」またはアップロードパネルから既存バッチに追加を選択
2. フロント処理
   - `PdfOrFolderUploadPanel` が `batchStore.addFiles(files)` を呼ぶ（`batchId` を内部で参照）
   - `batchStore.addFiles` は `batches.addFilesToBatch(batchId, files)` を呼ぶ
3. API 呼び出し
   - POST `/api/batches/{batch_id}/files` (multipart files[])
4. バックエンド処理（概略）
   - 各ファイルを処理して新しいセッションを作成し `batch.files` に追記 → `save_batch`
   - 更新済み `BatchResponse` を返却
5. フロント更新
   - `batchStore` は返却された `files` を使って UI を更新（新規ファイルが一覧に追加される）

---

## 4) セッション単体のコミット（埋め込み生成→インデックス登録）

1. ユーザー操作
   - EditorPage の `Commit` ボタンをクリックし、モーダルで `embeddingModel` / `indexSelection` を選択して確定
2. フロント処理
   - `sessionStore.commitSession(embeddingModel, indexName?)` を呼ぶ
   - ボタンは disabled / スピナー表示に切替
3. API 呼び出し
   - POST `/api/sessions/{session_id}/commit` （JSON body: `embedding_model`, optional `index_name`）
4. バックエンド処理（概略）
   - `create_job` → `save_job` でジョブを永続化
   - 別スレッドで `run_commit_job(job)` を実行（embedding 生成、OpenSearch bulk インデックス）
   - 初期レスポンスで `CommitResponse(job_id)` を返却
5. フロント更新
   - コミットはバッチフローに統合され、`batchStore` がジョブ ID を管理してポーリングを行います（単体コミットも `batchStore.commitSingle` を経由）。
   - ジョブの進捗に応じて `FileListPanel` の各ファイル行に表示されるステータス/進捗バーを更新します

障害パターン：

- ジョブが `failed` になった場合、`error_samples` を表示して再試行またはユーザへ通知する。

---

## 5) バッチ一括コミット（Commit All）

1. ユーザー操作
   - EditorPage の `Commit All`（バッチモード）ボタンをクリック
2. フロント処理
   - `batchStore.commitAll(embeddingModel, indexName?)` を呼ぶ
   - UI は全体の処理中インジケーターを表示
3. API 呼び出し
   - POST `/api/batches/{batch_id}/commit` （JSON body: `embedding_model`, optional `index_name`）
4. バックエンド処理（概略）
   - バッチ内の ready な各セッションに対して `create_job`/`save_job` を行い、各ジョブをスレッドで `run_commit_job` に渡して実行
   - ファイルごとに `file_info.status='committing'` と `file_info.job_id` を設定して `save_batch`
   - `BatchCommitResponse` を返却（`job_ids`, `job_session_map` 等）
5. フロント更新
   - `batchStore` は `commitJobIds` を登録し `pollCommitJobs()` を開始。ポーリングで `/api/jobs/{job_id}` を取得し、`files[]` の `status` を `committing`/`committed`/`error` に更新

注記:

- ポーリングは `batchStore.pollCommitJobs` で 1 秒間隔（可変）で動作。大量ジョブ時は負荷に注意。

---

## 6) 検索フロー（検索実行→結果→ジャンプ）

1. ユーザー操作
   - 検索ボックスにクエリを入力して検索ボタンを押す
2. フロント処理
   - `sessionStore.executeSearch()`（または `SearchPanel` 経由）が `searchApi.search({query, mode, filters, embedding_model?})` を呼ぶ
3. API 呼び出し
   - POST `/api/search`（JSON body）
4. バックエンド処理（概略）
   - モードに応じて BM25 / KNN / ハイブリッド のクエリを構築し OpenSearch へ投げる
   - ヒットを整形して `SearchResponse` を返却
5. フロント更新
   - `sessionStore` は `searchHits` を更新。`SearchPanel` がリストを表示
   - ユーザーがヒットをクリックすると `FullTextEditorRef.jumpToChunk(chunkId)` を呼び、該当位置へスクロール/ハイライト

---

## 7) 文書編集（全文更新）とチャンク戦略変更

### 全文更新

1. ユーザー操作: エディタで編集して Save
2. フロント処理: `sessionStore.setCurrentText(text)` を呼び、内部で `sessions.updateText(sessionId, version, text)` を実行
3. API 呼び出し: PUT `/api/sessions/{session_id}/text` (body: `version`, `current_text`)
4. バックエンド処理: page markers の検証 → `parse_text` → `build_page_map`/`chunk_pages` → 保存 → 新バージョンを返却
5. フロント更新: 成功時に `version`/`pageMap`/`chunks` を更新。409 の場合はリロードとユーザ通知

### チャンク戦略変更

- 同様の流れで `sessions.updateChunkStrategy`（PUT `/api/sessions/{session_id}/chunk_strategy`）を呼び、再チャンク結果を受け取る

---

## 8) チャンクメタデータ更新

1. ユーザー操作: `ChunkDetailPanel` でメタ（content_type, note 等）を編集して保存
2. フロント処理: `chunksApi.updateChunkMetadata(sessionId, chunkId, metadata)` を呼ぶ
3. API 呼び出し: PUT `/api/sessions/{session_id}/chunks/{chunk_id}/metadata`
4. バックエンド処理: `session = load_session(session_id)` → `session.chunk_metadata[chunk_id] = metadata` → `save_session`
5. フロント更新: 成功時に `sessionStore` の `chunkMetadataById` を更新し UI に反映

---

## 9) ジョブポーリングと UI 更新

-- ポーリング元: `batchStore.pollCommitJobs()`（バッチ／単体コミットは `batchStore.commitSingle` を介してバッチフローへ）

- ポーリング処理:
  1. `jobsApi.getJob(jobId)` を定期的に呼ぶ
  2. 取得した `JobStatusResponse` の `status` に応じて `jobStatus` や `files[].status` を更新
  3. 全ジョブが完了するとポーリングを停止
     -- UI 表示: 各ファイル行のステータスバッジと進捗バーを更新（`FileListPanel`）

---

## 付録: フロントが依存する契約点（短点検リスト）

- `SessionResponse` のフィールド名（snake_case）と型はフロント側 `types/dtos.ts` と一致させること
- `BatchResponse.files[].status` / `job_id` により UI 状態遷移を行っているため、バックエンドはこれらを確実にセットすること
- `IndexInfo.dimension` が `null` の場合、フロントは既存インデックス表示から除外するなどの対処をしている。仕様明記を推奨

---

ファイル: `frontend/src` の実装（`pages`, `components`, `store`, `api`）を参照して作成しました。追加で具体的なエラーメッセージ例やシーケンス図が必要であれば指示してください。
