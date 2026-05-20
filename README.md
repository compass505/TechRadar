# Tech Radar 505

Tech Radar 505 は、複数のITニュース媒体を広めに取得し、毎朝「前日分の編集済みニュース面」として公開する静的Webサイトです。

既存の TechCompass505 とは別サイトとして運営します。  
運用骨格は TechCompass505 と同じく、GitHub Actions で定期更新し、GitHub Pages で `docs/` を公開します。

## サイト構成

- `TOP`
  - 昨日のニュース
  - 前日を含む直近3日間の重要ニュース
- 昨日のAIニュース
- 昨日の企業ITニュース
- 昨日の開発ニュース
- 過去のニュース一覧
  - すべて / AI / 企業IT / 開発
- 検索
- お気に入り

## ローカル生成

```powershell
python scripts/build_editions.py
```

## RSS取得 + 生成

```powershell
python scripts/update_news.py
```

`OPENAI_API_KEY` がある場合は OpenAI API で重要度を補助判定します。  
APIキーが無い場合も、キーワードベースの簡易スコアで動きます。

## ローカル確認

```powershell
python -m http.server 8765 -d docs
```

ブラウザで `http://localhost:8765` を開きます。

## テスト

```powershell
python -m unittest discover -s tests -v
```

## GitHub Pages

GitHub Pages は以下の設定にします。

```text
Source: Deploy from a branch
Branch: main
Folder: /docs
```

## GitHub Actions

`.github/workflows/update-news.yml` が毎朝の更新を担当します。  
Repository Secrets に以下を登録してください。

```text
OPENAI_API_KEY
```

## 仕様

- `specification/news-v1-final-spec.md`
- `specification/news-v1-implementation-map.md`

