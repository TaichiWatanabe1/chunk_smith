# ChunkSmith Hybrid 全体設計書 v1.1

## 0. 概要

ChunkSmith Hybrid は、PDFから抽出した全文をUI上で編集しながら、チャンク戦略（サイズ/オーバーラップ等）を調整し、チャンク境界を可視化して品質確認（検索プレビュー）を行い、最終的に embedding 生成＋OpenSearch 登録（commit）まで行う一気通貫ツールである。

---

## 1. 方式（確定）

- **抽出＋登録（commit）までサーバーで実装**
- フロントは **PDFを直読みしない**（ズレ防止）
- PDF抽出ローダーは **PyMuPDF（fitz）**
- Embedding Provider は **LangChain OpenAI（OpenAIEmbeddings）**
- OpenSearch vector dimension はモデルに依存するため、**モデルごとにindexを分けて dimension を一致させる**
- フロントで **検索（text/vector/hybrid）** ができる（検索プレビュー）

---

## 2. ユースケース（最重要）

### UC-01 全文表示 & 境界可視化

- サーバー抽出した全文（ページマーカー付き）を Monaco Editor に表示
- **親：ページ境界（青）**、**子：ページ内チャンク境界（赤）**を描画
- chunk_size / overlap / split_mode / normalize を変えると即再計算され境界更新

### UC-02 全文編集 → 再計算

- ユーザーが全文を直接編集（不要文字削除など）
- debounce（例 500ms）でサーバーへ全文同期
- サーバーが pages に復元→正規化→再チャンキング→境界返却

### UC-03 チャンク詳細表示 & メタ修正

- チャンク選択で右ペインに **1チャンクのドキュメント情報**を表示
- v1で編集できるのは **メタデータのみ**（textは全文エディタでのみ編集）

### UC-04 検索プレビュー（精度確認）

- フロントから `text / vector / hybrid` 検索
- OpenSearchが返す結果をそのまま表示（RRF不要）
- 結果クリックで該当チャンク範囲へジャンプ

### UC-05 commit（embedding + OpenSearch）

- フロントで embedding model を選択
- サーバーがモデル次元を解決し、該当モデル用indexへ bulk投入
- job進捗をUIに表示

---

## 3. システム構成

### 3.1 コンポーネント

- **Front**：React + TypeScript + Vite + Monaco Editor
- **Server**：FastAPI
- **Storage**：v1はファイル永続化（session/job JSON）
- **Embedding**：OpenAI互換エンドポイント（LangChain OpenAIEmbeddings）
- **Search/Index**：OpenSearch（knn_vector + HNSW + cosine）

---

## 4. データ設計（確定）

### 4.1 ページマーカー（最重要：全文編集の整合維持）

サーバーは全文を以下形式で生成し、フロントに返す。フロントはこれを編集する。

```
<<<PAGE:1>>>
...page1...
<<<PAGE:2>>>
...page2...
...
```

- マーカーは削除/破損禁止（破損時は422）
- サーバーはマーカーで `current_pages` に復元する

### 4.2 Session（永続化単位）

- `session_id`（UUID）
- `doc_id`
- `extract_meta`
- `base_pages[]`（不変）
- `current_pages[]`（可変）
- `current_text`（ページマーカー入り）
- `page_map[]`（親：青境界 / 全文offset）
- `chunk_strategy`
- `chunks[]`（子：赤境界 / 全文offset）
- `chunk_metadata{chunk_id -> meta}`
- `version`（楽観ロック）

### 4.3 ChunkStrategy（v1）

- `chunk_size`（文字数）
- `overlap`（文字数）
- `split_mode`: `chars|paragraph|heading`
- `normalize`: bool

### 4.4 Chunk（子：赤）

- `chunk_id`（P012-C003 形式）
- `page_no`
- `start/end`（全文offset）
- `char_len`
- `hash`（再commit耐性）
- `warnings[]`（抽出ズレ検知）

### 4.5 ChunkMetadata（編集可能）

- `content_type`: `body|table|bullets|caption|other`
- `heading_path`（任意）
- `note`（任意）
- `quality_flag`: `good|suspect|broken`

---

## 5. サーバー設計（要点）

### 5.1 PDF抽出（PyMuPDF）

- `fitz.open(stream=pdf_bytes, filetype="pdf")`
- `page.get_text("text")` をページ単位で取得
- `\r\n -> \n` 程度の軽い整形
- 空ページ率が高い場合など `warnings` に記録

### 5.2 正規化（normalize=true時）

- `\r\n -> \n`
- 連続空白/連続空行の軽い整形（過剰にしない）
- 正規化後の `current_text` を返す（表示と一致）

### 5.3 チャンキング（親子）

- 親：`page_map` を `current_pages` から生成（青）
- 子：各ページ内で `chunk_size/overlap` 等により分割（赤）
- `split_mode=paragraph` は境界寄せ
- `split_mode=heading` は簡易見出しパターン

### 5.4 version（楽観ロック）

- `PUT /text` と `PUT /chunk_strategy` は version 必須
- 不一致は 409

### 5.5 commit（非同期ジョブ）

- 子チャンクのみを対象に embedding→OpenSearch bulk
- job進捗を保存・返却

---

## 6. OpenSearch設計（モデル次元対応：確定）

### 6.1 重要な制約

- OpenSearchの `knn_vector` は **index作成時に次元固定**
- 次元が異なるモデルを同一indexに混在不可

### 6.2 解決：モデルごとに index を分ける

- base index: `chunksmith-chunks`
- model_key: sanitize（`text-embedding-3-large`→`text_embedding_3_large`）
- actual index: `chunksmith-chunks__text_embedding_3_large`

### 6.3 ensure_index（検索でもcommitでも必ず呼ぶ）

- indexが無ければ、そのモデル次元で作成
- 既存indexなら mappingのdimension一致を確認し、不一致ならエラー

### 6.4 mapping

- HNSW + cosine（`cosinesimil`）
- `dimension` は動的に差し込む（テンプレート）

---

## 7. Embedding設計（LangChain OpenAI）

- provider: `langchain-openai`
- `OpenAIEmbeddings(model=...)` で embedding を生成
- `dimension()` は最初の1回だけ実測してキャッシュ

---

## 8. 検索設計（フロントで精度確認：確定）

### 8.1 サーバー検索API（代理）

- フロントは `POST /api/search` を呼ぶ
- mode:
  - `text`: BM25（match）
  - `vector`: kNN（queryをembedding）
  - `hybrid`: bool.should で match + knn（RRFなし、OpenSearch返却をそのまま）

### 8.2 検索結果で返す必須項目

- `chunk_id`, `page_no`, `start`, `end`, `char_len`, `score`, `text_snippet`, `metadata`
- フロントは start/endでエディタジャンプ可能

---

## 9. API仕様（最新版）

### 9.1 Sessions

- `POST /api/sessions`：PDF upload + extract + session作成
- `GET /api/sessions/{sid}`：最新状態
- `PUT /api/sessions/{sid}/text`：全文更新→再計算（version必須）
- `PUT /api/sessions/{sid}/chunk_strategy`：戦略更新→再計算（version必須）

### 9.2 Chunks

- `GET /api/sessions/{sid}/chunks/{chunk_id}`：chunk詳細
- `PUT /api/sessions/{sid}/chunks/{chunk_id}/metadata`：meta更新

### 9.3 Search

- `POST /api/search`：text/vector/hybrid

### 9.4 Commit/Jobs

- `POST /api/sessions/{sid}/commit`：job起動（embedding_model必須）
- `GET /api/jobs/{job_id}`：進捗

---

## 10. フロント設計（要点）

### 10.1 画面（Editor中心）

- Upload
- Editor（3ペイン）
  - 左：Monaco全文（直接編集）
  - 右上：ChunkTree（ページ→子）
  - 右下：ChunkDetail（doc/session/chunk情報 + metadata編集）
  - 追加：SearchPanel（mode切替・モデル選択・結果一覧→ジャンプ）
  - 追加：JobPanel（commit進捗）

### 10.2 可視化ルール（青×赤）

- 青：ページ開始行を装飾（左バー＋薄背景）
- 赤：子チャンク範囲に赤下線＋薄背景
- 選択チャンクは背景強め

### 10.3 パフォーマンス

- decorationsは **表示中ページ±1ページ**のみ貼る（windowing）

### 10.4 編集同期

- 500ms debounce で `PUT /text`（version付き）
- 409なら最新取得→サーバー版を優先（v1）

---

## 11. 実装フェーズ（Codexで通る順）

1. サーバー：models/storage/pdf_extractor/page_marker/chunking
2. サーバー：sessions API（create/get/update text/strategy）
3. サーバー：OpenSearch index manager（model別index）
4. サーバー：search API（text/vector/hybrid）
5. サーバー：commit/job runner（embedding+bulk）
6. フロント：Upload + Editor（Monaco表示 + 青/赤境界）
7. フロント：ChunkTree/Detail + metadata編集
8. フロント：SearchPanel（mode/model選択→結果→ジャンプ）
9. フロント：Commit/JobPanel

---

## 12. v1でやらない（明確に除外）

- チャンク単体の text 編集（全文のみ）
- RRF / rerank / highlight（必要ならv2）
- OCR（スキャンPDF対応はv2）

---
