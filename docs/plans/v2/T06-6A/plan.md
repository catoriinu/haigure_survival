# HAIGURE SURVIVAL v2 T06-6A タイトル基本設定・永続化 計画

更新日: 2026-08-10

## プロンプト

> V1タイトル画面にあった人数変更や各種オプションと、V2の荒れ度などを追加したいです。タイトル画面の設計と実際に機能を追加するところを、それぞれプランへ追加してください。

## 目的

I4で承認された数値・選択・視覚設定をV2タイトル画面へ追加し、単一の型付き設定snapshotとして保存、正規化、開始準備、Runtime生成へ接続する。開始モード、いきなり公開処刑、Mission等の機能ON/OFFはT06-6Bへ分離する。

## 開始条件

- I4がユーザー承認済みで文書化され、`develop`へ統合済みである。
- T06-5までのRuntimeとタイトル画面が最新`develop`へ統合済みである。

## 所有範囲

- V2タイトル設定の型、既定値、正規化、localStorage version、保存、全設定リセット。
- `src/v2/main.ts`のタイトル開始準備とRuntime必須入力への接続。
- V2タイトルUIの基本設定パネル、学校固定表示、既存音量・Character設定の統合。
- I4で採用したNPC人数、初期洗脳済み割合、Player初期状態、BIT設定、荒れ度、開始地点、視覚設定。
- T06-6A専用fixture、Web／Electron受入、計画結果。

## 対象外

- いきなり公開処刑モード、公開処刑設定、Mission／ミニマップ／放送／自動公開処刑のON/OFF。
- 学校Blender、GLB、NavMesh、生成器、Location、カタログhash。
- V1の保存構造を無検証で互換読込するfallback。

## 実装・検証契約

- 設定snapshotをタイトル表示、開始準備、session再構築の正本とし、Runtime各所がlocalStorageを直接読まない。
- 荒れ度、人数、BIT、開始地点など開始前設定は新sessionだけへ反映し、実行中の半端な差替えを行わない。
- 値の範囲外、型不正、参照不正はI4契約どおり正規化または明示エラーとし、暗黙の旧設定互換を追加しない。
- 設定変更、再起動、タイトル復帰、再開始、全設定リセット、I4で確定した未知fieldの扱い、Pointer Lock、UIクリック除外をWeb／Electronで検証する。
- 実装、検証、commit、push、Pull Request作成を一単位とし、独立レビューとmergeは別単位とする。
- `brainwashOnNoGunTouch`をRuntimeへ渡し、ハイグレ人間化放送の完了状態をOFF時は洗脳完了NPC全員G、ON時は全員Nへ切り替える。RuntimeがlocalStorageを直接読まず、T06-4で追加した専用G／N一括変更契約へ設定snapshotを渡す。

## 推奨設定

- モデル: GPT-5.6 Sol
- リーズニング: High
- 選定理由: タイトルUI、保存、開始準備、Runtime必須入力を一つの型付きsnapshotへ統一する横断実装が必要である。

## ステップ

- [ ] I4の確定設定表から型、既定値、正規化、保存versionを実装する
- [ ] 基本設定パネル、学校固定表示、既存音量・Character設定を統合する
- [ ] 人数、Player初期状態、BIT、荒れ度、開始地点、視覚設定をRuntimeへ接続する
- [ ] 「銃なしに触れたら洗脳」設定をハイグレ人間化放送のG／N一括変更へ接続する
- [ ] 保存、再起動、再構築、全設定リセットfixtureを追加する
- [ ] typecheck、build、Web／Electron、既存T06回帰を完了する
- [ ] 計画結果を更新し、T06-6A差分だけをcommitする

## 結果

未着手。I4の確定後に開始する。
