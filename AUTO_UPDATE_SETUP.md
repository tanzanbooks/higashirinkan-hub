# ニュース・求人の自動更新を有効にする

1. `.github/workflows/local-updates.yml`、`scripts/update_local.py`、`local-updates.json`と更新されたサイトのファイルをmainにアップロードします。隠しフォルダーが選べない場合はGitHubのAdd file → Create new fileで `.github/workflows/local-updates.yml` を作り、同名ファイルの内容を貼り付けます。
2. OpenAI APIでAPIキーを作成し、API用の請求設定・予算設定を行います。ChatGPTの月額料金とは別にAPI利用料金がかかります。キーをチャット・ソースコードに貼らないでください。
3. リポジトリ Settings → Secrets and variables → Actions → New repository secret で `OPENAI_API_KEY` として登録します。必要ならVariablesに `OPENAI_MODEL` を登録します。既定モデルはgpt-4.1-miniです。
4. Settings → Pages → Source を GitHub Actions に変更します。
5. Actions → Update local news and jobs → Run workflow を実行します。成功すると検索・AI要約・保存・サイト公開が完了します。その後は毎朝7時17分（日本時間）に予定実行します。初回が失敗したらActionsのログを確認してください。

ニュースはGoogle Newsの検索RSS、求人はBingの検索RSSを使用し「東林間」を検索します。求人検索は網羅的ではなく、募集終了や一覧ページが含まれることがあります。公開検索フィードの提供条件・仕様が変わると修正が必要です。全文は取得せず、見出しと抜粋をAIに渡して選別・要約します。元URLはAIに生成させず検索結果のURLを引き継ぎます。ニュースは直近30日を検索しますが、求人は検索側に日付がない結果もあります。

更新はリアルタイムではなく、毎日の予定実行です。GitHubの混雑時には遅延・実行されないことがあり、公開リポジトリでは長期間活動がないと定期実行が停止する場合があります。障害時は前回の情報と更新日時を残します。

このパッケージの時点ではAPIキー未設定・外部接続未検証のため、自動更新はまだ稼働していません。コードの構文確認は済ませていますが、実際の検索/API/公開を初回実行で確認してください。
