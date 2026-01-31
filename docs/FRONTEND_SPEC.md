# フロントエンド設計書（ChunkSmith）

以下は現在の `frontend/src` の実装状況を詳細に整理した設計書です。実装者向けにコンポーネント/ストア/APIフロー/エラー処理/拡張提案を含みます。

## 概要

- フレームワーク: React + Vite + TypeScript
- 状態管理: Zustand
- HTTP クライアント: `frontend/src/api/client.ts` の `request` / `uploadFile` を利用
- 主な責務:
  - ページ: 編集画面（`EditorPage`）、検索（`SearchPage`）、インデックス管理（`IndicesPage`）
  - コンポーネント: エディタ、チャンクツリー、ファイル/バッチアップロード、ファイル単位の進捗表示等
  - ストア: `sessionStore`（編集中のセッション状態）, `batchStore`（バッチファイル/アップロード/コミット状態）

---

## ディレクトリ要点

- `src/pages`
  - `EditorPage.tsx`: メイン画面。セッション読み込み、バッチモード、コミットUI、アップロードモーダル制御などを担当。
  - `IndicesPage.tsx`: OpenSearch インデックス一覧・削除UI。
  - `SearchPage.tsx`: 検索UI（SearchPanel を使用）。

- `src/components`
  - `PdfOrFolderUploadPanel.tsx`: フォルダ/ファイルアップロード UI。バッチ作成（`uploadFolder`）および既存バッチへの追加（`addFiles`）を担う。
  - `JsonlUploadPanel.tsx`: JSONLインポート用 UI（プレビュー含む）。
  - `FullTextEditor.tsx`: エディタ本体。`FullTextEditorRef` を通じて `jumpToChunk`, `jumpToRange` 等の API を提供。
  - `ChunkTree.tsx`, `ChunkDetailPanel.tsx`: チャンク一覧／詳細表示・編集。
  - `ChunkStrategyPanel.tsx`: チャンク戦略（chunk_size/overlap/normalize）を操作して `setChunkStrategy` を呼ぶ。
  - `FileListPanel.tsx`, `SessionHeader.tsx`, `SearchPanel.tsx`: 補助 UI（`JobPanel` は廃止し、Files パネルで per-file 進捗を表示）。

- `src/api`
  - `client.ts`: 共通の fetch wrapper（エラー型 `ApiError`）。`API_BASE` は環境変数 `VITE_API_BASE`。
  - `sessions.ts`, `batches.ts`, `search.ts`, `jobs.ts`, `indices.ts`, `embedding.ts`, `chunks.ts`: サーバ API 呼び出しラッパー。

- `src/store`
  - `sessionStore.ts`: セッションの CRUD、検索、コミットを管理（ジョブのポーリングは `batchStore` 側で集約）。
  - `batchStore.ts`: バッチの作成、ファイル追加、バッチ読み込み、バッチコミット（`commitAll`）およびジョブポーリングを管理。

- `src/types/dtos.ts`: サーバと共有される型定義（レスポンス/リクエスト DTO）。

---

## 主要フロー（データフロー詳細）

### 1) セッション作成と編集

- ユーザーが `PdfOrFolderUploadPanel` または `JsonlUploadPanel` からファイルをアップロード。フロントが `batches.createBatch`（複数）または `sessions.create`（単体）を呼ぶ。
- サーバは抽出・チャンク化を行い `SessionResponse` を返す。
- `sessionStore.loadSession(sessionId)` が `sessions.getSession` を呼び、レスポンスで `sessionStore` を更新。
- 編集（全文の置換やチャンク戦略の変更）は `sessions.updateText` / `sessions.updateChunkStrategy` を呼び、成功レスポンスで `sessionStore` の `version`, `chunks`, `pageMap`, `currentText` を更新。
- 楽観ロック: 更新リクエストには `version` を含める。サーバが 409 を返した場合、`sessionStore` はリロードを行う実装（ユーザーに alert して再取得）。

### 2) コミット（単体 / バッチ）

- 単体: `sessionStore.commitSession(embeddingModel, indexName?)` => `sessions.commit` => サーバは `create_job`/`save_job` してバックグラウンドで `run_commit_job` を走らせ、即座に `job_id` を返す。
- バッチ: `batchStore.commitAll(embeddingModel, indexName?)` => `batches.commitBatch` => サーバはバッチ内 ready セッションそれぞれに `job_id` を作成しスレッド開始、`BatchCommitResponse` を返す。`batchStore` は `commitJobIds` に job_id を格納して `pollCommitJobs()` を開始。
- ジョブの監視: `jobs.getJob(jobId)` をポーリングして `JobStatusResponse` を取り、`job_status` または `batch.files` の `status` を更新する。成功/失敗に応じてフロントの表示（Processing 状態や最終ステータス）を切り替える。

### 3) 検索

- `sessionStore.executeSearch()` が `searchApi.search` を呼ぶ。`SearchRequest` に `mode` と `embedding_model`（vector/hybrid 時）やフィルタを詰める。
- レスポンスを `searchHits` にセット。`SearchPanel` などが結果を表示し、結果クリックで `jumpToChunk` を呼び出す UX がつながる。

---

## 状態管理の設計（Zustand）

### `sessionStore`

- 単一ソースオブトゥルースとしてのセッション状態管理。
- API呼び出しで直接状態を更新し、失敗時は `error` にメッセージを格納。
- ジョブポーリングは指数バックオフ的に実装（`delay = Math.min(delay * 1.5, maxDelay)`）。
- バージョン競合、バリデーションエラー(422) を想定したエラーハンドリングがある。

### `batchStore`

- `batchId` の有無で「バッチモード」を判定。`EditorPage` がこのフラグを使って UI を切り替える。
- アップロード時は PDF のみフィルタ、サーバに multipart で送信。
- `commitAll` はバッチ API の応答を利用して `files` に job_id を紐付け、`pollCommitJobs` を開始。
- `pollCommitJobs` は setInterval ベースで job 状態を 1 秒毎に更新。

---

## 主要コンポーネントの責務（抜粋）

- `PdfOrFolderUploadPanel`
  - 新規バッチ作成 / 既存バッチへの追加の両方を扱う。`isAddMode = !!batchId` により挙動切替。
  - 選択ファイルのプレビュー（最大 8 件表示）や、BatchName の推定（フォルダ名から推測）を行う。

- `FullTextEditor`
  - 編集 UI。外部参照 (`ref`) により `jumpToChunk(chunkId)` / `jumpToRange(start,end)` を提供し、検索またはチャンクツリーからのジャンプを実現。

- `ChunkTree` / `ChunkDetailPanel`
  - チャンクの一覧表示、選択、編集（メタデータ）を実施。編集は `sessions.updateChunkMetadata` 経由で保存される。

`FileListPanel`

- 各ファイルのステータスと進捗バーを表示。`batchStore.commitJobStatuses` と `files[].job_id` を使用してポーリング結果を反映します。

---

## API 依存点（重要）

- `VITE_API_BASE` を介してバックエンド URL を組み立てるため、環境変数が正しく設定されている必要あり。
- `types/dtos.ts` とサーバ側 `core/models.py` の整合性が前提。フィールド名（snake_case）に依存している点に注意。
- インデックス次元（`IndexInfo.dimension`）が `null` の場合、フロントは利用可能モデルの次元と比較して `existing` 選択肢のフィルタに使っている。

---

## エラー処理の現状

- `ApiError` がラップされ、HTTP ステータス / body を持つ。ストアで捕捉して `error` に格納 or alert 表示。
- 楽観ロック（409）やバリデーション（422）については特別な分岐があり、ユーザーにダイアログで通知して再取得/修正を促す実装がある。
- 一部 UI（例: バッチ操作）では個別ファイルの失敗を許容し、成功したファイルのみを state に反映する設計。

---

## 既知の注意点と改善提案

1. ジョブ実行のスケーラビリティ
   - 現状フロントは短い間隔でジョブをポーリングし、サーバはスレッドでジョブを起動。負荷および並列度の問題が発生しうるため、バックエンドはワーカーキュー（Celery/RQ/Kafka 等）に移行すべき。

2. 型の整合性チェック
   - `types/dtos.ts` と `server/app/core/models.py` は手動で同期されている想定。型定義の自動生成（OpenAPI から TypeScript 型を生成）を検討。

3. UX: 非同期操作の一貫性
   - バッチ追加後やコミット完了後の画面遷移・通知が散発的。Toasts / Notification コンポーネントを導入し、成功/失敗を一元的に扱うと良い。

4. エラーハンドリングの改善
   - `request` のエラー処理は `ApiError.body` を捕捉しているが、UI に渡す標準的なエラーメッセージ構造を定義すると一貫した表示が可能。

5. テスト
   - `sessionStore` / `batchStore` のユニットテスト（モック API）を追加して、commit・poll・upload の振る舞いを保護する。

---

## 追加で作成可能なドキュメント（提案）

- エンドポイント別の具体的な成功 / 失敗 JSON 例（`docs/api_examples/`）
- コンポーネント間のシーケンス図（アップロード→セッション生成→コミット）
- テストケース一覧（重要フロー：upload/createSession/commit/poll）

---

## 参照ファイル

- `frontend/src/pages/EditorPage.tsx`
- `frontend/src/components/PdfOrFolderUploadPanel.tsx`
- `frontend/src/store/sessionStore.ts`
- `frontend/src/store/batchStore.ts`
- `frontend/src/api/*.ts`（client, sessions, batches, search, jobs, indices, embedding）
- `frontend/src/types/dtos.ts`

（必要なら、優先エンドポイントの JSON サンプルを追加します。どのエンドポイントを優先しますか？）
