# HAIGURE SURVIVAL v2 T06-4P Runtime・UI微修正 計画

更新日: 2026-08-10

## プロンプト

> T06-4P-1でミニマップ・BIT表示、T06-4P-2でエレベーター・NPCを修正する。

> B06統合後の最終学校資産を入力にし、学校バイナリは変更しない。

## 目的

P1で確定したRuntime／UI修正を、B06-4統合後の最終資産に対して2つの直列batchで実装する。T06-4P-1はミニマップとBIT表示、T06-4P-2はエレベーターとNPC利用を所有する。

## 直列batch

| 順序 | batch | 推奨ブランチ | 所有 | 主な完了条件 |
|---|---|---|---|---|
| 1 | T06-4P-1 ミニマップ・BIT表示 | `codex/v2-minimap-bit-polish` | Location読込、ミニマップ、BIT Material、fixture | 黒仕切り、明色開口、家具0、通常黒、デバッグ8色 |
| 2 | T06-4P-2 エレベーター・NPC | `codex/v2-elevator-npc-polish` | エレベーターRuntime、NPC policy、fixture | 4秒発車、自律利用、全Actor先着順、Follower追跡 |

## 共通開始条件

- B06-1～4が依存順に独立レビュー後、`develop`へ統合済みである。
- P1の再現手順、期待結果、受入条件が文書化済みである。
- 学校バイナリ、生成器、NavMesh、カタログhashを変更しない。

## 共通実装・検証契約

- 失敗fixtureを先に追加し、例外抑制や座標fallbackでなく、公開契約・状態遷移・policyの原因を修正する。
- 学校固有の階、座標、Collider名、NavMesh Area名をRuntimeへ直書きしない。
- T02、T04、T05、T06-3、T06-4の対象fixture、通常build、Web／Electron、console警告・エラー0件を確認する。
- 各batchはローカルcommitで止め、push、Pull Request、レビュー、mergeは別承認とする。

## 対象外

- Blender、GLB、NavMesh、生成器、Atlas、Location資産の形状・座標。
- I3／T06-5のCharacter反射、I4／T06-6A～Dのタイトル・設定・ライフサイクル。
- Mission内容・確率、エレベーター定員6人、Follower／Alarm／Mission優先度の変更。

## ステップ

- [x] P1のRuntime／UI指摘をT06-4P-1～2へ一意に割り当てる
- [x] 各batchの公開契約、fixture、Web／Electron受入を確定する
- [ ] B06-4統合後にT06-4P-1を実装・検証・commitする
- [ ] T06-4P-1統合後にT06-4P-2を実装・検証・commitする
- [ ] T06-4P-2の最終headでV3P第1磨き込みゲートを通す

## 結果

P1文書段階として、T06-4Pを2つの直列batchへ分割した。実装、fixture追加、commitは未実施である。
