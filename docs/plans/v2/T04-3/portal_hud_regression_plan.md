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
- [x] HUD変更を単独コミットし、専用worktreeの通常ゲームをローカルサーバーで起動確認する
- [x] 未参照フレームで削除される標的Area cursorを、スポーン時から連続移動として保持・更新する
- [x] Portal内で新たに追跡対象となる回帰と、Portal退出後のArea遷移を固定するテストを追加する
- [x] 99 NPC／50 BITを含む対象回帰、型検査、build、実ブラウザ、console、UTF-8・BOMなし・差分を検証する
- [x] 原因修正と最終結果を記録し、HUDとは別コミットを作成する

## 結果

NPC HUDは、全9状態を未洗脳、ハイグレ、gun、no-gunへ漏れなく分類した。`hit-a`、`hit-b`、`brainwash-in-progress`はハイグレに含め、4分類合計がNPC総数と一致するRuntime契約と回帰テストを追加した。通常ゲームHUDでも50 NPCの内訳合計が50になることを確認し、HUD変更を`5b92088`として単独コミットした。

Navigation Area例外の原因は、前フレームで`resolve()`されなかった標的のArea cursorを`beginFrame()`が削除し、次にPortal内で標的へ選び直した際に、履歴を使わず`locate()`を実行していたことである。全標的のcursorを初回frameから保持し、各frameの連続移動を`advance()`で更新するよう修正した。Portal内を初期位置として禁止する`locate()`契約や、明示的な搬送・再配置契約は変更していない。

実際の学校Portalを使うT04 fixtureで、未参照frame後に`school-ground`からPortal内へ入り、Portal内では直前Areaを維持して`school-upper-01`へ退出する回帰を追加した。`typecheck:v2`、`typecheck:t04`、`typecheck:t05`、通常build、T04 build、T05 build、T04実ブラウザ115/115、T05実ブラウザ294/294を通過した。T05では99 NPC／66洗脳済みNPC／50 BITとHUD内訳合計99を確認した。通常ゲームをローカルサーバーで継続動作させ、今回のゲーム更新例外がないことを確認した。アプリ内ブラウザ固有の既知のPointer Lock `WrongDocumentError`を除き、consoleのwarning/errorは0件だった。
