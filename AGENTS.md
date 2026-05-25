# AGENTS.md

このファイルは `TechRadar/` リポジトリで作業するAIエージェント向けのプロジェクト固有ガイドです。
共通ルールは親フォルダの `../AGENTS.md` も参照してください。

## プロジェクト概要

`TechRadar/` は複数媒体のITニュースを取得し、article から story 単位へまとめ、毎朝の編集済みニュース面として公開するプロジェクトです。
`techcompass/` よりも網羅性とニュース面構成を重視します。

主な処理経路:

```text
scripts/update_news.py
-> data/articles.json
-> scripts/build_editions.py
-> app/surfaces.py
-> docs/data/*.json
-> docs/index.html + docs/app.js
```

## 主なファイル

- `scripts/update_news.py`: 複数RSS取得、OpenAI APIまたはローカル用判定、保存、edition生成。
- `scripts/build_editions.py`: `data/articles.json` から story と各日 edition JSON を生成。
- `app/models.py`: `Article` / `Story` のドメインモデル。
- `app/surfaces.py`: story化、カテゴリ・facet推定、ニュース面の選抜ロジック。
- `data/articles.json`: 元記事保存データ。
- `docs/data/stories.json`, `docs/data/archive-index.json`, `docs/data/manifest.json`, `docs/data/editions/*.json`: 生成される公開用データ。
- `docs/index.html`, `docs/app.js`, `docs/styles.css`: 手書きの静的Web UI。
- `tests/test_surfaces.py`: ニュース面選抜ロジックの単体テスト。
- `specification/news-v1-final-spec.md`: v1仕様の正本。
- `specification/news-v1-implementation-map.md`: 実装対応表。古い `site/` 表記が残っていても、現行コードでは `docs/` を使う。

## 注意点

- `scripts/update_news.py` は通常 `OPENAI_API_KEY` が必要。
- ローカル検証だけなら `--skip-openai` を使えるが、これは簡易キーワード判定であり本番品質ではない。
- `scripts/build_editions.py` は `docs/data/` のJSONを再生成し、古い `docs/data/editions/*.json` を整理する。
- 検索とお気に入りは静的クライアント側で処理する。お気に入りは browser localStorage 保存。
- `docs/index.html`, `docs/app.js`, `docs/styles.css` は手書きUI資産として直接編集してよい。

## よく使う確認コマンド

```powershell
cd C:\Users\81704\OneDrive\ドキュメント\news_ai_Web\TechRadar
python -m pip install -r requirements.txt
python scripts/build_editions.py
python -m unittest discover -s tests -v
python -m http.server 8765 -d docs
```

## ローカル用の取得・生成確認

OpenAI APIを使わず、簡易キーワード判定で確認する場合だけ使う。

```powershell
python scripts/update_news.py --skip-openai
```

## 本番系更新コマンド

ユーザーから明示された場合だけ実行する。

```powershell
python scripts/update_news.py
```

## 検証の目安

- 選抜ロジック、モデル、生成処理を変更したら、`python -m unittest discover -s tests -v` と `python scripts/build_editions.py` を実行する。
- UI変更後は `python -m http.server 8765 -d docs` で `docs/` をHTTP経由確認する。
- OpenAI APIやRSS取得を伴う本番系コマンドを実行した場合は、どのデータが更新されたかを作業報告に含める。
