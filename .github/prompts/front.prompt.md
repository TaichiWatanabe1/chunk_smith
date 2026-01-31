---
agent: "agent"
tools: ["vscode", "execute", "read", "edit", "search", "web", "agent"]
description: "Generate a new API"
---

## ChunkSmith フロント実装プロンプト（v1.2 完全版）

あなたはリポジトリ内で React + TypeScript + Vite のフロントエンドを実装してください。アプリ名は **ChunkSmith**。目的は、PDF抽出結果の全文を Monaco Editor に表示し、ページ境界（青）とチャンク境界（赤）を可視化し、全文編集→サーバー同期→再チャンキング、検索（text/vector/hybrid）による精度確認、commit進捗表示まで行えるUIを作ることです。以下の仕様を厳守してください。

---

# 1. 技術要件

- React 18 + TypeScript
- Vite
- Monaco Editor は `@monaco-editor/react` を使う
- API通信は `fetch` でOK（axios不要）
- 状態管理は v1 は **Zustand** を使う（軽くて実装簡単）
- スタイルは最小で良い（Tailwindが入っていなければ plain CSSでもOK）
- ルーティングは `react-router-dom` を使用
- 例外・エラー時は画面に分かるメッセージを出す（alertでOK）

---

# 2. ファイル構成（この通りに作る）

```
frontend/
  src/
    main.tsx
    App.tsx
    routes.tsx
    pages/
      UploadPage.tsx
      EditorPage.tsx
    components/
      SessionHeader.tsx
      ChunkStrategyPanel.tsx
      FullTextEditor.tsx
      ChunkTree.tsx
      ChunkDetailPanel.tsx
      SearchPanel.tsx
      JobPanel.tsx
    api/
      client.ts
      sessions.ts
      chunks.ts
      search.ts
      jobs.ts
      embedding.ts
    store/
      sessionStore.ts
    types/
      dtos.ts
    utils/
      debounce.ts
      lineStarts.ts
      groupChunks.ts
  index.html
  package.json
  vite.config.ts
```

---

# 3. DTO型定義（src/types/dtos.ts）

以下の型を定義し、APIとUIで共有する。

- `ChunkStrategy`
- `PageSpan`
- `ChildChunk`
- `ChunkMetadata`
- `SessionResponse`
- `UpdateTextResponse`
- `ChunkDetailResponse`
- `SearchRequest`
- `SearchHit`
- `SearchResponse`
- `CommitRequest`
- `CommitResponse`
- `JobStatusResponse`

必須フィールドは設計書に従う（`current_text`, `page_map`, `chunks`, `version`, `chunk_strategy` など）。

---

# 4. ルーティング

- `/` → `UploadPage`
- `/sessions/:sessionId` → `EditorPage`

---

# 5. APIクライアント実装

## 5.1 `src/api/client.ts`

- `API_BASE` は `import.meta.env.VITE_API_BASE ?? ""` を使う
- `request(path, {method, body, headers})` を作り JSON を扱う
- エラー時は response body があれば表示

## 5.2 エンドポイント関数

- `createSession(file: File)` → `POST /api/sessions` multipart
- `getSession(sessionId)` → `GET /api/sessions/{sid}`
- `updateText(sessionId, version, currentText)` → `PUT /api/sessions/{sid}/text`
- `updateChunkStrategy(sessionId, version, strategy)` → `PUT /api/sessions/{sid}/chunk_strategy`
- `getChunkDetail(sessionId, chunkId)` → `GET /api/sessions/{sid}/chunks/{chunkId}`
- `updateChunkMetadata(sessionId, chunkId, metadata)` → `PUT /api/sessions/{sid}/chunks/{chunkId}/metadata`
- `search(req)` → `POST /api/search`
- `commit(sessionId, embeddingModel)` → `POST /api/sessions/{sid}/commit`
- `getJob(jobId)` → `GET /api/jobs/{jobId}`
- `getEmbeddingModels()` → `GET /api/embedding/models`（なければ固定配列fallback）

---

# 6. Zustand Store（src/store/sessionStore.ts）

状態を1つのstoreにまとめる。

## state

- `sessionId, docId, version`
- `currentText`
- `chunkStrategy`
- `pageMap: PageSpan[]`
- `chunks: ChildChunk[]`
- `selectedChunkId: string | null`
- `chunkMetadataById: Record<string, ChunkMetadata>`
- `searchQuery, searchMode, embeddingModel, searchHits`
- `jobId, jobStatus`

## actions

- `loadSession(sessionId)`
- `setCurrentText(text)`
- `setChunkStrategy(strategy)`
- `selectChunk(chunkId)`
- `setSearchQuery(q)` / `setSearchMode(m)` / `setEmbeddingModel(m)`
- `setSearchHits(hits)`
- `setJob(jobId)` / `setJobStatus(status)`

---

# 7. UploadPage 実装

- PDFファイルinput + Uploadボタン
- `createSession(file)` → 成功したら `navigate(/sessions/{session_id})`

---

# 8. EditorPage 実装（中心）

## 8.1 初期ロード

- `useParams().sessionId` を `loadSession` で読み込む
- `SessionHeader` を表示（doc_id/session_id/version）

## 8.2 レイアウト

- header（固定）：`SessionHeader` + `ChunkStrategyPanel` + `Commit`ボタン + embeddingモデル select
- main：
  - 左：`FullTextEditor`
  - 右：上から `SearchPanel` → `ChunkTree` → `ChunkDetailPanel`

- 下：`JobPanel`

---

# 9. FullTextEditor（Monaco + 青/赤装飾 + windowing）

## 9.1 必須仕様

- Monacoに `currentText` を表示
- 編集可能（readOnly=false）
- 500ms debounceで `updateText` を呼ぶ（version付き）
- サーバーの戻りで `currentText/pageMap/chunks/version` を更新
- 409のときはサーバー版を採用して上書きし、通知を出す

## 9.2 offset→Range 変換（必須）

- `utils/lineStarts.ts` に
  - `buildLineStarts(text): number[]`
  - `offsetToPosition(offset, lineStarts)`
  - `offsetRangeToRange(start,end,lineStarts)`
    を実装

## 9.3 decorations（必須）

- 青：ページ境界（`page_map` の start位置の行）
- 赤：子チャンク境界（範囲を薄背景＋下線）
- 選択：selectedChunkId の範囲は背景強め

## 9.4 windowing（必須）

- 表示中ページ±1ページのみ装飾
- 可視範囲先頭の offset を推定し、`page_map` の start/end から page_no を二分探索で特定する
- その page_no-1..+1 の page_map と chunks のみ decorations を貼る

## 9.5 ジャンプAPI（必須）

`FullTextEditor` は外から

- `jumpToRange(start,end)`
- `jumpToChunk(chunkId)`
  を呼べるようにする（ref + useImperativeHandle）。

---

# 10. ChunkStrategyPanel（chunk戦略）

- chunk_size: number input
- overlap: number input
- split_mode: select（chars/paragraph/heading）
- normalize: checkbox
- 200ms debounceで `updateChunkStrategy(sessionId, version, strategy)` を呼ぶ
- レスポンスの `page_map/chunks` を store に反映

---

# 11. ChunkTree（ページ→子チャンク）

- `chunks` を page_no でグルーピングして表示
- Page node（P001など）クリックでページの start にジャンプ
- Child node クリックで `selectChunk(chunk_id)` + エディタジャンプ

`utils/groupChunks.ts` を作る（page_noでグループ化）。

---

# 12. ChunkDetailPanel

- selectedChunkId が null なら “Select a chunk”
- selectedChunkId があるなら `getChunkDetail` を呼んで詳細表示
- 表示項目（read-only）：
  - doc_id/session_id/chunk_id/page_no/start/end/char_len/hash/warnings/chunk_strategy/extractor_version

- 編集項目（editable）：
  - content_type select
  - heading_path input
  - note textarea
  - quality_flag select

- Saveボタンで `updateChunkMetadata`

---

# 13. SearchPanel（text/vector/hybrid）

## UI

- query input
- mode select（text/vector/hybrid）
- embedding model select（vector/hybrid時に有効）
- Searchボタン

## 動作

- `POST /api/search` を呼ぶ
- filters はデフォで `{doc_id, session_id}` を入れる
- 結果一覧（score/chunk_id/page_no/snippet）
- クリックで `selectChunk(chunk_id)` + エディタジャンプ + detail表示

※RRFは実装しない。OpenSearch返却をそのまま表示。

---

# 14. Commit + JobPanel

## Commit

- headerの Commit ボタンで `commit(sessionId, embeddingModel)`
- `job_id` を store に保存

## JobPanel

- jobId があれば `getJob(jobId)` をポーリング（1秒→2秒→5秒）
- status/progress/failed/error_samples を表示
- 完了したら “Succeeded/Failed” を表示

---

# 15. UI最小スタイル（必須）

- 左右2カラムが崩れない程度のCSSを用意
- 青/赤/選択の装飾クラスを用意
  - `.pageBoundary`
  - `.chunkBoundary`
  - `.chunkSelected`

---

# 16. 完了条件（これが動けばOK）

- PDFアップロード→Editorへ遷移
- 全文がMonacoに表示され編集可能
- chunk戦略変更で境界更新
- ChunkTree/検索結果クリックでジャンプ＋選択＋詳細表示
- metadata更新がサーバーに反映
- text/vector/hybrid検索ができる
- commit→job進捗表示ができる

---

# 17. 注意事項（重要）

- `current_text` はページマーカーを含む。UIで消させない前提だが、ユーザーが壊した場合 422 を表示すること。
- offsetは **文字オフセット**。バイトではない。
- 装飾は windowing 必須（全文全装飾は重くなる）
- エラーは握りつぶさず画面に出すこと

---

これで実装を開始してください。すべてのファイルを作成し、ビルドが通る状態にしてください。

---

## 追加：Vite 環境変数（READMEに書く）

- `.env.local`

```
VITE_API_BASE=http://localhost:8000
```

---
