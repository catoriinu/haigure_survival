# HAIGURE SURVIVAL v2 T06-6C V1タイトル・ゲームオーバー 計画

更新日: 2026-08-10

## プロンプト

> V1と同じようにタイトル画面を修正し、ゲームオーバーの仕組みや演出をV1と同じにする作業を忘れないでください。

## 目的

I4で承認されたV1相当のタイトル表示、ゲームオーバー状態遷移、演出、リプレイ、タイトル復帰をV2へ実装する。T06-6A／Bの設定schemaを維持し、静的学校資源の再利用はT06-6Dへ分離する。

## 開始条件

- T06-6Bが独立レビュー後に`develop`へ統合済みである。
- I4でV1から移す表示、演出、入力、タイミング、Audio、Pointer Lock、HUD終了順が承認済みである。
- `codex/v2-title-game-over`の専用worktreeを使用する。

## 所有範囲

- V2タイトル表示のV1相当レイアウト・演出とT06-6A／B設定UIの統合。
- ゲームオーバー表示、状態遷移、Rリプレイ、Enterタイトル復帰、Pointer Lock解除、HUD・Audioの終了順。
- T06-6C専用fixture、通常Web／Electron受入、計画結果。

## 対象外

- 設定項目、保存version、開始モード、Mission等のON／OFF契約の再設計。
- 学校Scene／GLB／NavMeshの再利用、静的・動的資源interfaceの分離。
- 学校Blender、GLB、NavMesh、生成器、Location資産。

## 受入条件

- I4で選択したV1相当タイトル表示がT06-6A／Bの設定と同じ画面で成立する。
- 通常終了・失敗・公開処刑系終了が承認済みゲームオーバー表示と演出へ遷移する。
- Rリプレイは同じ設定snapshotで新sessionを開始し、Enterはタイトルへ戻る。
- Pointer Lock、入力、HUD、ミニマップ、Mission、Audio、Character表示を二重購読・残留なしで終了する。
- Web／Electronの複数回リプレイ・タイトル復帰でconsole警告・エラー0件である。

## 検証

- タイトル→開始→各ゲームオーバー→Rリプレイ→Enterタイトル復帰を状態遷移fixtureで固定する。
- T06-6A／Bの設定保存・機能ON／OFF回帰を維持する。
- 通常build、Web／Electron、Pointer Lock、Audio、HUD、複数session、console警告・エラー0件を確認する。

## ステップ

- [ ] I4のV1タイトル・ゲームオーバー契約をfixture化する
- [ ] タイトル表示と設定UIを統合する
- [ ] ゲームオーバー遷移・演出・R／Enter入力を実装する
- [ ] HUD、Audio、Pointer Lock、購読の終了順を統一する
- [ ] Web／ElectronとT06-6A／B回帰を完了する
- [ ] 結果を更新してT06-6C差分だけをcommitする

## 結果

未着手。T06-6Bの`develop`統合後に開始する。
