# HAIGURE SURVIVAL v2 B06 学校資産微修正 計画

更新日: 2026-08-10

## プロンプト

> 実装順は `P1 → B06-1～4 → T06-4P-1～2 → I3 → T06-5 → I4 → T06-6A～D → P2` とする。学校バイナリは単一担当で直列編集する。

> B06-1で学校構造、B06-2でエレベーター建築、B06-3で小物・表札、B06-4でミニマップ意味資産・Locationを修正する。

## 目的

P1で確定した学校資産修正を、学校バイナリの単一担当を維持した4つの直列batchへ分ける。各batchは前batchが独立レビュー後に`develop`へ統合された最新状態から開始し、1ブランチ・1セッションで実装、検証、ローカルcommitまで完結させる。

## 直列batch

| 順序 | batch | 推奨ブランチ | 所有 | 主な完了条件 |
|---|---|---|---|---|
| 1 | B06-1 学校構造仕上げ | `codex/v2-school-structure-polish` | 建築、Collider、必要なNavMesh | 全角、階層帯、階段、隙間、ちらつき、屋上箱 |
| 2 | B06-2 エレベーター建築統合 | `codex/v2-elevator-building-integration` | エレベーター躯体、床、Collider、NavMesh | 連続白壁、床露出0、段差0、ロッカー接地 |
| 3 | B06-3 小物・表札 | `codex/v2-school-props-signage` | 小物正本、表札、Atlas | 便器形状、教室名、日本語、男女ピクトグラム |
| 4 | B06-4 ミニマップ意味資産・Location | `codex/v2-minimap-location-assets` | `MAP_*`、Location、資産監査 | 恒久仕切り・通行開口、屋上分離、Area、Location |

## 共通所有範囲

- 学校生成正本、小物生成正本、学校`.blend`、GLB、Atlas、監査器、プレビュー。
- 形状影響があるbatchだけの人間用／Room Variant用／BIT用NavMesh再生成とカタログhash更新。
- 各batchの個別計画と検証成果。

## 共通対象外

- `src/ui/v2Minimap.ts`、`src/v2/bitSystem.ts`、エレベーター／NPC Runtime、Mission状態機械、タイトルUI。
- P1に記録されていない部屋再設計、新しい校舎・ギミック、ステージ固有座標のTypeScript直書き。
- 形状変更と無関係なNavMesh再ベイク、欠落情報を名前や座標で補うfallback。

## 共通実装・検証契約

- 同じ学校`.blend`、GLB、NavMesh、生成器を複数branchで同時編集しない。
- 表示、Collider、遮蔽、NavMesh、意味資産の境界を一致させ、重複面、隙間、段差、めり込みを残さない。
- 変更前後の同一視点画像を残し、P1-E01～P1-E17と全校網羅視点を比較する。
- 生成を2回実行し、GLB、Atlas、必要なNavMesh、監査署名の決定性を確認する。
- 影響範囲に応じて資産監査、T02、T04、T05、T06-3、T06-4、通常build、Web／Electron、console警告・エラー0件を確認する。
- 各batchはローカルcommitで止める。push、Pull Request、レビュー、mergeは別承認とする。

## ステップ

- [x] P1の全指摘をB06-1～4へ一意に割り当てる
- [x] 各batchの個別計画、所有、依存、受入条件を作成する
- [ ] B06-1を最新`develop`から実装・検証・commitする
- [ ] B06-1統合後にB06-2を実装・検証・commitする
- [ ] B06-2統合後にB06-3を実装・検証・commitする
- [ ] B06-3統合後にB06-4を実装・検証・commitする
- [ ] B06-4の最終資産をT06-4P-1へ引き渡す

## 結果

P1文書段階として、B06を4つの直列batchへ分割した。学校バイナリはB06-1、B06-2、B06-3、B06-4の順に単一担当で更新する。実装、資産生成、commitは未実施である。
