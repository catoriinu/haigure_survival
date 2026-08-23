# HAIGURE SURVIVAL v2 T06-6C V1タイトル・ゲームオーバー・レスポンシブ表示 計画

更新日: 2026-08-24

## プロンプト

> V1相当のタイトル画面とゲームオーバー、リプレイ、タイトル復帰を実装してください。小さい画面でも設定が上下にはみ出して操作不能にならず、折り返し、文字縮小、隅の基準点によってresizeへ追従してください。

2026-08-24 実装指示:

> 最新`origin/develop=2b3cc8f`から`codex/v2-title-game-over`専用worktreeを作成し、T06-6Cを実装してください。タイトルはsafe-area対応の5基準点Gridと`wide`／`compact`／`stacked`へ統合し、実寸overflowを`ResizeObserver`で監視してください。設定DOMを再生成せず、値、開始モード、選択状態、scroll位置、focusを維持し、最小480×360まで横scrollなし、最低font 12px、操作高32px以上で全設定へ到達可能にしてください。警告とは独立した「保存済み」表示を追加し、versionを設定scroll外へ固定してください。
>
> 通常ゲームはPlayer洗脳後だけRで同じ設定・新seedの即時再試行、Enterで`assembly` epilogueへ進み、`assembly`のEnterでタイトルへ戻してください。公開処刑は完了後だけRで同じscenarioを再演し、Enterでタイトルへ戻してください。R操作を汎用retryへ改名し、Enter用actionと純粋dispatcherを追加し、旧actionの互換aliasは残さないでください。通常epilogueと公開処刑完了でMission結果を表示してください。
>
> managed sessionの非活性化と破棄を分離し、Pointer Lock解除、入力停止、Mission／ミニマップ／HUD停止、Audio停止、動的session破棄、次session生成の順を固定してください。T06-6C fixture、関連typecheck・build、Web／Electron実環境、差分監査を完了し、個別計画と中央計画を更新してT06-6C差分だけをcommitしてください。push、Pull Request、レビュー、merge、T06-6Dは行わないでください。

## 開始時調査

- `origin/develop=2b3cc8fd0755327166c87d41c82703eb799d8d1a`にT06-6A／Bが統合済みであることを確認した。
- 既存タイトルは640×480で中央タイトルと設定が重なり、右設定が横overflowする。480×360ではタイトルと設定がさらに重なり、全項目へ通常操作で到達できない。
- 通常ゲーム中のRは無効、Enterはphaseを問わずタイトルsession再構築へ直結していた。公開処刑Rは進行中にも受理されていた。
- `assembly`への全human洗脳済み3秒遷移とMission結果部品は存在するが、手動epilogue APIと`assembly`結果表示が未接続だった。
- 共有`develop`の未追跡`docs/plans/skills/`と`scripts/v2/__pycache__/`は専用worktreeへ持ち込まず、変更しない。

## 目的

T06-6A／Bのsemantic groupをV1相当タイトルへ統合し、5基準点を使うresponsive配置と、ゲームオーバー、R再試行、Enter遷移、終了処理を実装する。

## 開始条件

- T06-6Bが独立レビュー後に`develop`へ統合済みである。
- `codex/v2-title-game-over`の専用worktreeを最新`origin/develop`から作成する。

## タイトル表示契約

- rootは`100dvw`／`100dvh`、safe-area対応のCSS Gridとし、中央、左上、右上、左下、右下をnamed areaとして固定する。
- 中央へタイトル・開始状態・モード、左上へ固定学校、右上へ警告／保存状態、左下へ補助設定、右下へ操作列と独立versionを配置する。
- 広い画面は中央＋右設定、中程度は設定group折り返し、狭い画面は上部タイトル＋下部全幅設定へ切り替える。
- 適応順はgap／padding縮小、group折り返し、font-size最低12pxまで縮小、設定viewportだけの縦scrollとする。labelを折り返し、全controlを最小32px高、`min-width: 0`にする。
- media queryと`ResizeObserver`を併用し、実寸overflowにより`wide`／`compact`／`stacked` classを切り替える。DOMを再生成せず値、focus、modeを維持する。
- 画面全体の横scrollを禁止し、設定viewportはwheel、trackpad、Tab／Shift+Tabで全項目へ到達可能にする。versionはscroll領域外の右下に維持する。

## 状態遷移契約

- Player洗脳後もG／N／H操作を継続できる。通常game overのRは同じ設定snapshot、新seedでsessionを再作成し、開始地点、荒れvariant、Character、NPC／BIT配置を再抽選する。
- 通常game overのEnterはepilogueへ進む。全human洗脳済みは3秒後に自動epilogueへ進む。
- 即時公開処刑完了のRはT06-6Bの同一scenario・会場を再演する。epilogue／公開処刑完了のEnterはタイトルへ戻る。
- タイトル復帰はPointer Lock解除、入力停止、Mission／ミニマップ／HUD停止、Audio停止、動的session破棄の順に行い、二重購読を残さない。

## 対象外

- 設定field、保存version、開始モード、Mission／Alarm契約の再設計。
- 静的学校資源interfaceと再利用。これはT06-6Dが所有する。
- 学校資産、画像、音声素材の変更。

## 検証

- 1920×1080、1280×720、1024×600、800×600、640×480で通常／即時公開処刑を確認する。480×360でもscrollで全設定へ到達可能とする。
- 1920→1024→640→1280の連続resizeで設定値、focus、mode、隅からのsafe inset、右下versionを維持する。
- bounding rect、横overflow 0、scroll末尾到達、keyboard順、focus維持を自動fixture化し、同じサイズをElectron screenshotで確認する。
- タイトル→開始→各終了→R→Enter→再開始を複数周行い、Pointer Lock、Audio、HUD、購読、console warning・error 0件を確認する。

## ステップ

- [x] 最新`origin/develop`と既存実装を監査し、専用branch／worktreeを作成する
- [x] V1相当タイトルと終了状態遷移をfixture化する
- [x] 5基準点gridとwide／compact／stacked配置を実装する
- [x] `ResizeObserver`、折り返し、文字縮小、設定scrollを実装する
- [x] game over、R／Enter、終了順を実装する
- [x] 全viewportの自動fixtureとElectron目視を完了する
- [x] 結果を更新してT06-6C差分だけをcommitする

## 結果

- `#titleOverlay`をsafe-area対応のGridへ変更し、`ResizeObserver`で`wide`／`compact`／`stacked`を切り替えるcontrollerを追加した。設定DOMを維持したまま値、開始モード、focus、scroll位置を保持し、独立した警告／保存済みstatusと設定scroll外のversionを配置した。
- 通常ゲームはPlayer洗脳後だけRで同一設定・新seedの即時再試行、Enterで`assembly`へ移行する。`assembly`のEnterはタイトル復帰、公開処刑完了後のRは同一scenario再演、Enterはタイトル復帰とし、未洗脳時と公開処刑進行中は無効にした。通常epilogueと公開処刑完了ではMission結果を表示する。
- managed sessionの`deactivate()`と`dispose()`を分離し、Pointer Lock解除、入力・HUD・Mission・ミニマップ・Audio・購読停止、動的session破棄、次session生成の順を固定した。学校Scene／GLB／NavMeshは現行どおりsession単位で破棄し、静的資源再利用はT06-6Dへ残した。
- 1920×1080、1280×720、1024×600、800×600、640×480、480×360の通常／即時公開処刑をElectron fixtureで確認し、横overflow 0、font 12px以上、操作高32px以上、全設定到達、連続resize時の値・mode・focus・scroll・version維持を確認した。実アプリでは通常retryの設定維持・seed更新、epilogue、公開処刑の進行中無効・完了後再演、複数周後のUI root単一性と診断0件を確認した。
- `typecheck:v2`、T05／T06／T06-4／T06-6A／T06-6B／T06-6Cのtypecheck・build、通常build、Web配布監査、T06-6B／T06-6C Electron受入、`git diff --check`に合格した。配布licenseのcheckout改行差を再発させないため`.gitattributes`でLFを固定し、学校資産、GLB、NavMesh、生成器は変更していない。
