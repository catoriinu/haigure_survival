# PR #81 レスポンシブ表示レビュー修正 計画

更新日: 2026-08-29

## プロンプト

> https://github.com/catoriinu/haigure_survival/pull/81 のコードレビューをして、インラインコメントしてください。
> 今回はフロントエンドの改修が多いので、実際の見え方や画面サイズが違うときに崩れないか、将来の耐修正性や適切な共通化、クラス構成や設定の持ち方が出来ているかを厳密に確認してください。

追加指示:

> マージ済みであれば、修正点が見つかったら develop ブランチから修正ブランチを切り、このセッション内で調査結果どおりに修正し、コミット、push、Pull Request 作成まで行ってください。

## ステップ

- [x] PR #81 の最新 base／head、差分、既存レビュー、検証証跡を確認する
- [x] 1920×1080、1280×720、720×600、480×360 の実表示と横 overflow を確認する
- [x] 再現した2件を PR #81 の current head へインライン投稿する
- [x] 最新 `origin/develop=05d77b1` から専用 branch／worktree を作成する
- [x] compact の実寸横 overflow を検出して stacked へ降格する
- [x] Electron 受入のステージ幅条件を330pxへ同期し、720px前後の境界ケースを追加する
- [x] 対象 typecheck／build、Electron 受入、実ブラウザ、差分監査を完了する
- [x] 実装結果を更新し、commit／push／develop向けPull Request作成の準備を完了する

## 結果

- `fitsHorizontally()`へoverlay自身の`scrollWidth`判定を追加し、実寸overflowが残る場合は`wide`だけでなく`compact`からも`stacked`へ降格するよう修正した。
- Electron受入のステージ幅上限を現行CSSの330pxへ同期し、749×600の`compact`と720×600の`stacked`を境界ケースへ追加した。
- `typecheck:t06-6c`、`build:t06-6c`、`typecheck:v2`、T06-6C Electron受入、実ブラウザの720×600／749×600、`git diff --check`に合格した。720×600は`stacked`、749×600は`compact`となり、document／overlay／settingsの横overflowはいずれも0、ブラウザfixtureは`passed`となった。
- PR #81のcurrent headへ2件をインライン投稿した。修正は最新`origin/develop=05d77b1`から分岐した`codex/pr81-responsive-review-fix`だけで行い、元スレッドは解決していない。
