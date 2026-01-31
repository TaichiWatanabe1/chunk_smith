## フロントエンド UI 機能仕様

**概要**:

- **目的**: エディタ、チャンク一覧、ファイルアップロード、コミット／ジョブ管理など、ユーザーが行う主要な操作を要素レベルで定義し、対応するコンポーネント・状態遷移・API契約を明確にします。

**画面 / 主な領域**:

- **Editor ページ**: ドキュメント表示・全文編集、チャンクジャンプ、コミットモーダル。
- **サイドバー（チャンクツリー）**: ページ毎のチャンク一覧、選択・折り畳み、ジャンプ。
- **チャンク詳細パネル**: 選択チャンクのメタデータ表示・編集（保存ボタン）。
- **アップロードパネル**: フォルダ/PDF/JSONL の追加、既存バッチへ追加ボタン。
- **ジョブ進捗表示**: 進行中・過去ジョブの状態は各ファイル行（Files パネル）で表示し、`jobs` API をポーリングして更新します。
- **検索パネル**: インデックス検索、選択した結果からエディタジャンプ。

**主要コンポーネント（ファイル参照）**:

- **FullTextEditor**: frontend/src/components/FullTextEditor.tsx — Monaco 拡張, デコレーション, jumpToChunk(), debounced save。
- **ChunkTree**: frontend/src/components/ChunkTree.tsx — チャンク列挙、選択ハンドラでエディタに命令。
- **ChunkDetailPanel**: frontend/src/components/ChunkDetailPanel.tsx — `getChunkDetail()` / `updateChunkMetadata()` を使用して表示・保存。
- **FileListPanel / FolderUploadPanel / PdfUploadPanel**: frontend/src/components/\* — アップロード UI とバッチ選択/作成。
  -- **FileListPanel**: frontend/src/components/FileListPanel.tsx — 各ファイルのステータスと進捗表示（ポーリング結果を反映）。
- **SessionHeader**: frontend/src/components/SessionHeader.tsx — セッション名、保存状態、コミットボタン（モーダル起動）。

**状態モデル（高レベル）**:

- **Global**: `sessionStore`（sessionId, selectedChunkId, editorState, version）
- **Batch**: `batchStore`（pendingFiles, uploadProgress, selectedBatchId）
- **UI 状態**: idle, loading, saving, committing, job-running, error

**重要なユーザー操作と遷移**:

- **チャンク選択**: ChunkTree のクリック → sessionStore.selectedChunkId 更新 → FullTextEditor が jumpToChunk() を実行 → ChunkDetailPanel が詳細取得。
- **全文編集**: FullTextEditor の変更はローカルでデコレーション適用 → デバウンスして `sessions.update_text` 呼び出し（バージョン楽観ロック）。
- **メタデータ保存**: ChunkDetailPanel の Save → `updateChunkMetadata(sessionId, chunkId, metadata)` → 成功時 UI 成功フラグ。
- **ファイル追加 / バッチ操作**: UploadPanel でファイル選択 → 新規バッチ作成 or 既存バッチ選択 → `batches.add_files` / `batches.create` 呼び出し → UI にアップロードプログレス表示。
- **Commit All**: SessionHeader の Commit All → モーダルでインデックス/モデル確認 → `sessions.commit` または `batches.commit` 実行 → サーバ側でジョブ作成 → フロントエンドは `batchStore` が `jobs` API をポーリングし、Files パネル上の各ファイル行で進捗を表示して完了を待つ。
- **インデックス選択時の互換性チェック**: インデックス一覧取得（`indices.list`） → 選択されたインデックスの dimension を embedding モデルの output と比較 → 必要なら警告表示。

**API 契約（利用されるエンドポイント概観）**:

- **セッション**: `POST /api/sessions`、`PUT /api/sessions/{id}`、`POST /api/sessions/{id}/commit` — DTO: SessionCreate/Update/Commit。フロントは `sessionStore` を通じて呼び出す。
- **バッチ**: `POST /api/batches`、`POST /api/batches/{id}/files`、`POST /api/batches/{id}/commit` — アップロードは multipart。
- **チャンク**: `GET /api/sessions/{s}/chunks/{id}`、`PUT /api/sessions/{s}/chunks/{id}` — チャンク詳細取得/メタ更新。
- **埋め込みモデル情報**: `GET /api/embedding/models`、`GET /api/embedding/dimensions` — フロントは返却配列（モデル情報）を直接扱う。
- **インデックス**: `GET /api/indices`、`GET /api/indices/{id}` — `dimension` を確認して互換性判定。
- **ジョブ**: `GET /api/jobs/{id}` — ジョブステータスのポーリング。

**エラー処理とバリデーション**:

- API エラーは共通の `ApiError` でラップして表示（SessionHeader / UploadPanel / ChunkDetailPanel で処理）。
- アップロード: ファイルサイズ/タイプのクライアント側チェック。サーバ応答のステータスに基づくユーザ向けメッセージ。
- コミット時: モデル／インデックス不整合はモーダルで警告、ユーザ確認を要求。

**アクセシビリティとキーボード操作**:

- チャンク移動: `j`/`k` で次/前チャンク、`g` で先頭、`G` で末尾（将来的に追加検討）。
- フォーカス可能なボタン・フォーム要素に aria-label を付与。

**実装ノート / マッピング**:

- 業務ロジックはストア経由で実行（frontend/src/store/sessionStore.ts, batchStore.ts）。
- 編集はデバウンス（debounce.ts）でサーバ負荷を軽減。
- チャンクジャンプは editor の selection と view を同期させる。連携点: `ChunkTree` → `sessionStore` → `FullTextEditor`。

**優先的な改良候補**:

- コミットワークフローの統合テスト（手動でのシナリオ確認を自動化）。
- エラー時のリトライ/バックオフ戦略は `batchStore` のポーリングで扱う（必要に応じて指数バックオフ等を導入）。

---

ファイル: [docs/FRONTEND_UI_SPEC.md](docs/FRONTEND_UI_SPEC.md)
