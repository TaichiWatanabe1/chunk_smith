---
agent: "agent"
tools: ["vscode", "execute", "read", "edit", "search", "web", "agent"]
description: "Generate a new API"
---

## Codex向け：ChunkSmith Hybrid サーバー実装プロンプト（v1.2 完全版）

あなたはリポジトリ内で FastAPI サーバーを実装してください。アプリ名は **ChunkSmith Hybrid**。目的は、PDFをアップロードして PyMuPDF でページ単位抽出し、ページマーカー付き全文を返し、全文編集→再チャンキング、チャンク境界（青/赤）計算、検索（text/vector/hybrid）で品質確認、commitで embedding 生成（OpenAI互換エンドポイント）→ OpenSearch bulk投入（モデル別index次元整合）、job進捗APIまで提供することです。以下を厳守して実装してください。

---

# 1. 技術要件

- Python 3.11+
- FastAPI + Uvicorn
- Pydantic v2（可能なら）/ v1でもOKだが一貫させる
- PyMuPDF（`pymupdf`, importは `fitz`）
- OpenSearch Python Client（`opensearch-py` 推奨）
- Embedding は **OpenAI互換**エンドポイントを利用（OpenAI API またはローカルサーバー）
- 永続化：v1は **JSONファイル**（session/job）
- commitは **バックグラウンドジョブ**（threadでOK）
- CORS対応

---

# 2. ディレクトリ構成（この通りに作る）

```
server/
  app/
    main.py
    api/
      sessions.py
      chunks.py
      search.py
      jobs.py
      embedding.py
    core/
      config.py
      errors.py
      models.py
      storage.py
      page_marker.py
      normalize.py
      chunking.py
      hashing.py
      search_builders.py
      logging.py
    integrations/
      pdf_extractor.py
      embeddings/
        base.py
        langchain_openai.py
      opensearch_client.py
      opensearch_index_manager.py
    jobs/
      runner.py
      schemas.py
  storage/
    sessions/
    jobs/
  requirements.txt
  README.md
  tests/
```

---

# 3. 環境変数（`core/config.py` に集約）

必須（デフォルト値も付ける）：

- `CHUNKSMITH_ENV=dev|prod`（default dev）
- `CHUNKSMITH_STORAGE_DIR=./storage`
- `CHUNKSMITH_MAX_PDF_MB=50`
- `CHUNKSMITH_CORS_ORIGINS=http://localhost:5173`
- `PDF_EXTRACTOR=pymupdf`
- `PDF_EXTRACTOR_VERSION=1.0.0`

Embedding（OpenAI互換）

- `OPENAI_BASE_URL=https://api.openai.com/v1`（またはローカルの `/v1`）
- `OPENAI_API_KEY`（OpenAI API の場合は必須。ローカルは任意の文字列でOKな場合が多い）
- `EMBEDDING_MODELS=text-embedding-3-large,text-embedding-3-small`（モデル一覧取得が失敗した場合のフォールバック）

OpenSearch

- `OPENSEARCH_HOST=http://opensearch:9200`
- `OPENSEARCH_BASE_INDEX=chunksmith-chunks`
- `OPENSEARCH_BULK_SIZE=200`
- `OPENSEARCH_VERIFY_SSL=false`
- `OPENSEARCH_USERNAME` / `OPENSEARCH_PASSWORD`（任意）

---

# 4. エラーフォーマット（統一）

`core/errors.py` を作り、すべて以下で返す：

```json
{ "error": { "code":"...", "message":"...", "detail": {...} } }
```

代表コード：

- `PDF_TOO_LARGE`
- `PDF_EXTRACT_FAILED`
- `PAGE_MARKER_INVALID`
- `VERSION_CONFLICT`
- `OPENSEARCH_DIMENSION_MISMATCH`
- `EMBEDDING_FAILED`
- `OPENSEARCH_ERROR`
- `JOB_NOT_FOUND`
- `SESSION_NOT_FOUND`

FastAPIの exception handler を `main.py` に設定すること。

---

# 5. Pydanticモデル（`core/models.py`）

以下を定義し、APIの入出力に使う：

- `RawPage(page_no:int, text:str)`
- `ExtractMeta(extractor_name:str, extractor_version:str, page_count:int, warnings:list[str], created_at:datetime)`
- `ChunkStrategy(chunk_size:int, overlap:int, split_mode:Literal['chars','paragraph','heading'], normalize:bool)`
- `PageSpan(page_no:int, start:int, end:int, char_len:int, hash:str)`
- `ChildChunk(chunk_id:str, page_no:int, start:int, end:int, char_len:int, hash:str, warnings:list[str]=[])`
- `ChunkMetadata(content_type:Literal['body','table','bullets','caption','other']='body', heading_path:str='', note:str='', quality_flag:Literal['good','suspect','broken']='good')`
- `Session(session_id:str, doc_id:str, extract_meta:ExtractMeta, base_pages:list[RawPage], current_pages:list[RawPage], current_text:str, page_map:list[PageSpan], chunk_strategy:ChunkStrategy, chunks:list[ChildChunk], chunk_metadata:dict[str,ChunkMetadata], version:int, created_at:datetime, updated_at:datetime)`

DTO（API向け）

- `SessionResponse`（Sessionから不要情報を省かずそのまま返してOK）
- `UpdateTextRequest(version:int, current_text:str)`
- `UpdateTextResponse(version:int, current_text:str, page_map:list[PageSpan], chunks:list[ChildChunk])`
- `UpdateChunkStrategyRequest(version:int, chunk_strategy:ChunkStrategy)`
- `UpdateChunkStrategyResponse(chunk_strategy:ChunkStrategy, page_map:list[PageSpan], chunks:list[ChildChunk])`
- `ChunkDetailResponse`（doc_id, session_id, chunk_id, page_no, start,end,char_len, extractor_version, chunk_strategy, hash, warnings, metadata）
- `UpdateChunkMetadataRequest(ChunkMetadataを継承でOK)`
- `SearchRequest(query:str, mode:Literal['text','vector','hybrid'], top_k:int=20, filters:dict[str,str]|None=None, embedding_model:str|None=None, vector:dict|None=None)`
- `SearchHit(rank:int, score:float, doc_id:str, session_id:str, chunk_id:str, page_no:int, start:int, end:int, char_len:int, text_snippet:str, metadata:dict|None)`
- `SearchResponse(mode:str, index_name:str, top_k:int, took_ms:int, hits:list[SearchHit])`
- `CommitRequest(embedding_model:str)`
- `CommitResponse(job_id:str)`
- `JobStatusResponse(status:Literal['queued','running','succeeded','failed'], progress:float, total:int, succeeded:int, failed:int, error_samples:list[dict])`

---

# 6. Storage（v1：JSONファイル）

`core/storage.py`

- `save_session(session: Session)`
- `load_session(session_id: str) -> Session`
- `save_job(job: dict)`
- `load_job(job_id: str) -> dict`

実装要件：

- 書き込みは `tmp` に書いて `os.replace`（破損耐性）
- パスは `CHUNKSMITH_STORAGE_DIR/sessions/{sid}.json` と `.../jobs/{job_id}.json`
- 存在しない場合は `SESSION_NOT_FOUND` / `JOB_NOT_FOUND`

---

# 7. ページマーカー（最重要）

`core/page_marker.py`

- `build_text(pages: list[RawPage]) -> str`
- `parse_text(current_text: str, expected_page_count: int) -> list[RawPage]`

仕様：

- フォーマット：

  ```
  <<<PAGE:1>>>
  ...
  <<<PAGE:2>>>
  ...
  ```

- parse時：
  - 1..N の連番であること
  - 欠落/重複/順序崩れ/マーカー未検出は `PAGE_MARKER_INVALID`（422）

---

# 8. PDF抽出（PyMuPDF確定）

`integrations/pdf_extractor.py`

- `extract_pdf_to_pages(pdf_bytes: bytes, extractor_version: str) -> tuple[list[RawPage], ExtractMeta]`

実装：

- `fitz.open(stream=pdf_bytes, filetype='pdf')`
- `page.get_text('text')` を採用
- `\r\n -> \n` は必ず実施
- warnings：
  - 空に近いページ割合が高い場合 `TEXT_EMPTY_MANY_PAGES`

抽出失敗は `PDF_EXTRACT_FAILED`（422）

---

# 9. 正規化

`core/normalize.py`

- `normalize_pages(pages: list[RawPage]) -> list[RawPage]`
- v1は軽く：
  - `\r\n -> \n`
  - 空行3+→2（任意）
  - 過剰なスペース圧縮はしない（表が壊れるため）

---

# 10. チャンキング（親子）

`core/chunking.py`

関数：

- `build_page_map(current_text: str, pages: list[RawPage], doc_id: str) -> list[PageSpan]`
- `chunk_pages(current_text: str, page_map: list[PageSpan], pages: list[RawPage], strategy: ChunkStrategy, doc_id: str) -> list[ChildChunk]`

重要仕様：

- `start/end` は **current_text（ページマーカー含む全文）** の文字オフセット
- ページ境界（青）は `<<<PAGE:n>>>` 行の開始オフセットを `start` にすること
- 子チャンクはページ本文範囲の中で分割し、start/endを全文オフセットに直す

split_mode：

- chars：固定窓 size/overlap
- paragraph：`\n\n` と `\n` の境界へ寄せ
- heading：簡易正規表現（最低限）で候補を作る（v1簡易で良い）

---

# 11. Hash

`core/hashing.py`

- `sha256_text(s: str) -> str`
- `hash_page(doc_id, page_no, page_text) -> str`
- `hash_chunk(doc_id, chunk_id, chunk_text) -> str`

OpenSearch `_id` は **hash** を使う（再commit耐性）

---

# 12. Embedding（OpenAI互換）

`integrations/embeddings/base.py`

- `class EmbeddingProvider: embed_texts(texts)->vectors, dimension()->int, name()->str`

`integrations/embeddings/langchain_openai.py`

- OpenAI互換エンドポイントへ接続（`OPENAI_BASE_URL`, `OPENAI_API_KEY`）
- `client.embeddings.create(model=..., input=texts)`
- `dimension()` は初回embedで len を見てキャッシュ

---

# 13. OpenSearch client & Index Manager（モデル別index）

`integrations/opensearch_client.py`

- OpenSearchクライアント生成（認証なし/あり両対応）
- `search(index_name, body)->raw`
- `bulk(actions)->raw`
- `index_exists(index_name)->bool`
- `create_index(index_name, body)`
- `get_mapping(index_name)->dict`

`integrations/opensearch_index_manager.py`

- `sanitize_model_key(model: str) -> str`（英数と\_のみ）
- `get_index_name(base_index: str, model: str) -> str`
- `ensure_index(index_name: str, dim: int) -> None`
  - 無ければ mappingテンプレに `dim` を差し込んで作成
  - あれば `vector.dimension` を取得して一致確認
  - 不一致なら `OPENSEARCH_DIMENSION_MISMATCH`（400/409どちらでも良いが明確に）

mapping仕様：

- `knn_vector` + HNSW + cosine（`cosinesimil`）
- その他フィールド：doc_id/session_id/chunk_id/page_no/start/end/char_len/text/hash/metadata/chunk_strategy/extractor_version/embedding(meta)

---

# 14. 検索（text / vector / hybrid、RRFなし）

`core/search_builders.py`

- `build_text_query(query, top_k, filters)`
- `build_knn_query(vector, top_k, filters, k, num_candidates)`
- `build_hybrid_query(query, vector, top_k, filters, k, num_candidates)`（bool.shouldで match + knn）

`api/search.py`

- `POST /api/search`
- mode:
  - text：BM25 match
  - vector：embedding→knn
  - hybrid：embedding→bool.should（match + knn）

- filters は `bool.filter` に term で入れる（doc_id/session_id など）

注意：

- OpenSearchのknnクエリ形式が環境差で変わる可能性があるため、knn body生成は1箇所（builder）に集約すること。
- 返却は `_score` をそのまま `score` に入れる
- snippetは `text` の先頭 200文字程度で良い（highlightは不要）

---

# 15. Sessions API（`api/sessions.py`）

エンドポイント：

1. `POST /api/sessions`（multipart PDF）

- サイズチェック（MAX_PDF_MB）
- extract_pdf_to_pages
- chunk_strategy デフォルト（例：800/100/paragraph/true）
- current_pages = base_pages
- current_text = build_text(current_pages)
- normalize=trueなら normalize_pages→current_text再生成
- page_map/chunks 計算
- session保存（version=1）
- SessionResponse返却

2. `GET /api/sessions/{sid}`

- load_session→返却

3. `PUT /api/sessions/{sid}/text`

- request: version, current_text
- version一致確認（不一致→VERSION_CONFLICT 409）
- parse_text→current_pages復元（expected_page_countは extract_meta.page_count）
- normalize適用（strategy.normalize）
- current_text再生成（normalize後）
- page_map/chunks 再計算
- version++
- 保存→UpdateTextResponse返却

4. `PUT /api/sessions/{sid}/chunk_strategy`

- request: version, chunk_strategy
- version一致確認（409）
- strategy更新
- normalize適用（strategy.normalize）
- current_text再生成
- page_map/chunks 再計算
- version++
- 保存→UpdateChunkStrategyResponse返却

---

# 16. Chunks API（`api/chunks.py`）

1. `GET /api/sessions/{sid}/chunks/{chunk_id}`

- sessionロード
- chunksから該当chunk取得
- metadataは `chunk_metadata.get(chunk_id, default)` を返す
- ChunkDetailResponse返却

2. `PUT /api/sessions/{sid}/chunks/{chunk_id}/metadata`

- sessionロード
- chunk存在確認
- metadata更新（dictに保存）
- session保存
- `{ok:true}`返却

---

# 17. Commit & Jobs（非同期）

`api/jobs.py`

- `GET /api/jobs/{job_id}`：job JSON返却（JobStatusResponseに整形）

`api/sessions.py` に `POST /api/sessions/{sid}/commit` を追加

- request: embedding_model 必須
- job_id作成（uuid）
- job初期状態保存（queued）
- threadで `jobs/runner.py` を起動
- CommitResponse返却

`jobs/runner.py`

- jobをrunningに更新
- sessionロード（スナップショットを取るなら session JSONのコピーを持つ）
- embedding_providerを作成（LangChain OpenAIEmbeddings）
- dim解決
- index_name = base + "\_\_" + sanitize(model)
- ensure_index
- 子チャンクを列挙して texts作成
- embeddingをバッチで生成
- bulk actionsを作成（\_id=hash, \_sourceにvector含む）
- bulk投入
- succeeded/failed更新、error_samples保存
- 最終 status succeeded/failed

---

# 18. Embedding Models API（`api/embedding.py`）

- `GET /api/embedding/models`
- envの `EMBEDDING_MODELS` を split して返す
- 形式：`{"models":["text-embedding-3-large", ...]}`

---

# 19. main.py（アプリ起動）

- FastAPI作成
- router登録（sessions/chunks/search/jobs/embedding）
- CORS設定（env）
- exception handlers登録（errors.py）
- `/healthz` を用意（200 OK）

---

# 20. requirements.txt（最低限）

- fastapi
- uvicorn[standard]
- pydantic
- pymupdf
- opensearch-py
- openai
- python-multipart

---

# 21. README.md（起動方法）

- env例
- uvicorn起動
- API概要

---

# 22. 完了条件（これが動けばOK）

- PDF upload → session作成できる
- `GET /sessions/{sid}` で `current_text/page_map/chunks` が返る
- `PUT /text` で全文更新→再計算される（ページマーカー破壊で422）
- `PUT /chunk_strategy` で境界更新される
- `POST /search` が text/vector/hybrid で動く（hybridはbool.should、RRFなし）
- `POST /commit` → job起動 → `/jobs/{job_id}` で進捗が取れる
- OpenSearch indexはモデル別に作成され、dimension不一致ならエラーになる

---
