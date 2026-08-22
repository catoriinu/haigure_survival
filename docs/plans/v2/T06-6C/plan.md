# HAIGURE SURVIVAL v2 T06-6C V1タイトル・ゲームオーバー・レスポンシブ表示 計画

更新日: 2026-08-22

## プロンプト

> V1相当のタイトル画面とゲームオーバー、リプレイ、タイトル復帰を実装してください。小さい画面でも設定が上下にはみ出して操作不能にならず、折り返し、文字縮小、隅の基準点によってresizeへ追従してください。

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

- [ ] V1相当タイトルと終了状態遷移をfixture化する
- [ ] 5基準点gridとwide／compact／stacked配置を実装する
- [ ] `ResizeObserver`、折り返し、文字縮小、設定scrollを実装する
- [ ] game over、R／Enter、終了順を実装する
- [ ] 全viewportの自動fixtureとElectron目視を完了する
- [ ] 結果を更新してT06-6C差分だけをcommitする

## 結果

未着手。T06-6Bの`develop`統合後に開始する。
