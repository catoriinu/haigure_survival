# Navigation Area Portal再追跡・NPC HUD分類修正 計画

更新日: 2026-08-01

## プロンプト

テストプレイ中、生徒会室と廊下の間でプレイヤーがビームを受けて点滅している間に、次の例外が発生した。原因を調査する。

```text
Navigation Area Portal内の初期位置は禁止されています: navigation-area-portal-03
```

HUDに表示するNPC情報を、未洗脳、ハイグレ、gun、no-gunの4分類へ分解する。`brainwash-in-progress`に加えて、`hit-a`と`hit-b`もハイグレへ含める。それ以外の細かい状態は最も近い分類へ振り分ける。

エラー修正は、Portal内の位置を一方のAreaへ推測で割り当てず、提案した追跡履歴を維持する方針で実装する。同じ修正ブランチでHUDと原因修正を別コミットにし、先にHUDを修正して起動確認できる状態にした後、原因修正へ進む。

## ステップ

- [x] 最新`origin/develop`、dirty差分、既存worktree、実行中サーバーを確認し、専用branch／worktreeを作成する
- [x] NPCの全状態を未洗脳、ハイグレ、gun、no-gunへ分類し、4分類の合計がNPC総数と一致するRuntime契約を追加する
- [x] 通常HUDへ4分類を表示し、型検査・対象fixture・buildを実行する
- [ ] HUD変更を単独コミットし、専用worktreeの通常ゲームをローカルサーバーで起動確認する
- [ ] 未参照フレームで削除される標的Area cursorを、スポーン時から連続移動として保持・更新する
- [ ] Portal内で新たに追跡対象となる回帰と、Portal退出後のArea遷移を固定するテストを追加する
- [ ] 99 NPC／50 BITを含む対象回帰、型検査、build、実ブラウザ、console、UTF-8・BOMなし・差分を検証する
- [ ] 原因修正と最終結果を記録し、HUDとは別コミットを作成する

## 結果

実装中。
