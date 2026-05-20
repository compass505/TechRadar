# News v1 実装対応表

## 1. 全体像

```text
docs/news-v1-final-spec.md
        ↓
scripts/build_editions.py
        ↓
app/surfaces.py
        ↓
site/data/*.json
        ↓
site/index.html + site/app.js
```

---

## 2. 実装ファイル

| ファイル | 役割 |
| --- | --- |
| `app/models.py` | `Article` / `Story` のドメインモデル |
| `app/surfaces.py` | story 化、facet 推定、各ニュース面の選抜ロジック |
| `scripts/build_editions.py` | 入力JSONから静的 edition JSON を生成するバッチ |
| `site/index.html` | 静的Web UI の入口 |
| `site/app.js` | ナビゲーション、表示面、検索、お気に入りのUI制御 |
| `site/styles.css` | 画面スタイル |
| `tests/test_surfaces.py` | 前日基準・直近3日・専門面の選抜テスト |

---

## 3. 生成されるデータ

| パス | 内容 |
| --- | --- |
| `site/data/stories.json` | story 一覧 |
| `site/data/archive-index.json` | 過去一覧用の facet index |
| `site/data/manifest.json` | 表示可能な edition 一覧 |
| `site/data/editions/YYYY-MM-DD.json` | 各朝の surface edition |

---

## 4. surface key

| key | 表示名 |
| --- | --- |
| `top_yesterday` | 昨日のニュース |
| `recent_important` | 直近の重要ニュース |
| `yesterday_ai` | 昨日のAIニュース |
| `yesterday_enterprise_it` | 昨日の企業ITニュース |
| `yesterday_development` | 昨日の開発ニュース |

---

## 5. 現在のMVPでまだ仮のところ

- story 統合は保守的なタイトル近似
- facet 判定はキーワードベース
- 入力は `docs/tmp-two-week-scored.json` のサンプルデータ
- 本番取得・GitHub Actions への接続は未接続
- 検索は静的クライアント内検索
- お気に入りは browser localStorage 保存

---

## 6. 次に実装するなら

1. 既存のニュース取得処理を `scripts/build_editions.py` の入力形式へ接続する
2. GitHub Actions の既存朝実行から生成スクリプトを呼ぶ
3. story 統合を設計書の類似判定ロジックへ置き換える
4. facet / importance の判定を本番ロジックへ置き換える
5. 静的JSONで十分か、DB/API化するかを運用量で判断する
