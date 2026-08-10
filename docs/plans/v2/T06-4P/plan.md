# HAIGURE SURVIVAL v2 T06-4P Runtime・UI微修正 計画

更新日: 2026-08-10

## プロンプト

> ミニマップの出し方の微修正、ロジックで問題があったときの小さな修正などを、今後の適切なタスクへ追加したいです。

> 1Fの中央校庭と体育館北側通路は「校庭」、校舎・体育館の外側は「校舎外周」と現在地表示し、校舎外周をMission目的地には追加しないでください。

> Missionに「3F 体育館屋上へ行く」を追加してください。

## 目的

P1で確定したミニマップ、HUD、入力、状態遷移、Mission・放送連携などの小規模なRuntime/UI修正を、B06統合後の確定学校資産に対して実施する。新機能、タイトル設定、学校バイナリは変更しない。

## 開始条件

- T06-4がV3Aゲートと独立レビュー後に`develop`へ統合済みである。
- P1で再現手順、期待結果、対象ファイル、受入条件が確定済みである。
- B06に対象batchがある場合は、B06が独立レビュー後に`develop`へ統合済みである。

## 所有範囲

- `src/ui/v2Minimap.ts`、該当HUD、限定された`src/v2/**`接続、対応fixture。
- P1で承認された小規模batchだけを所有する。
- `docs/plans/v2/T06-4P/plan.md`と専用検証。

## 対象外

- Blender、GLB、NavMesh、生成器、カタログhash、B05意味資産の座標・形状。
- I3／T06-5のキャラクター反射・表示仕上げ。
- I4／T06-6A／T06-6Bのタイトル設定・開始モード・機能ON/OFF。
- 仕様を変える大規模なAI・Mission再設計。

## 実装・検証契約

- 表示微修正は1920×1080のタイトル、playing、Pointer Lock、ミニマップ、ステータス、スタミナ、Mission HUD、helpの重なりを実画面で確認する。
- ロジック修正は再現fixtureを先に追加し、例外を抑制するfallbackではなく原因となる契約または状態遷移を修正する。
- T06-3、T06-4、T04／T05関連回帰、通常Web／Electron、console警告・エラー0件を影響範囲に応じて検証する。
- 修正、検証、commit、push、Pull Request作成を一単位とし、独立レビューとmergeは別単位とする。

## B06後の条件付き引継ぎ: 屋上入口の複数NPC停止

- B06で屋上階段室、Collider、NavMeshの幅・段差・接続が修正または正常確認された後も、複数NPCが同一時刻に屋上へ入る場合だけ停止するなら本タスクで扱う。
- Alarm、直接追跡、同行、放送Mission、通常Mission、自律移動を同じ開始位置・目的地で比較し、行動理由ではなく経路集中で再現するかをfixture化する。
- 先頭NPCの停止、後続NPCの同一点重なり、経路再計画、物理movement segment拒否を観測し、例外抑制や座標fallbackではなくNPC移動状態または混雑解消契約を修正する。
- 受入条件は、単体／複数NPCが屋上へ進入でき、屋上から階下へも戻れ、既存の同行最優先とAlarm／Mission優先度を変えないこととする。

## B06後の受入: 1F 校庭／校舎外周表示

- B06が追加した正本`area-school-perimeter`を既存のArea解決だけで読み、座標、Collider名、NavMesh Area名から表示を推測しない。
- Player、最初の同行者、同行人数／洗脳人数Missionの候補NPCについて、中央校庭と体育館北側通路では`1F 校庭`、東西南北の外側歩行域では`1F 校舎外周`へ現在地表示を切り替える。
- `area-school-perimeter`にはMission Locationが存在しないため、Player Location Mission、NPC通常／放送Location Mission、ミニマップのLocation目標へ校舎外周を追加しない。
- B06の意味資産だけで既存Runtimeが正しく表示できる場合はRuntimeを変更せず、B05／T06-3／T06-4 fixtureと通常Web／Electronの受入だけを追加する。

## B06後の受入: 3F 体育館屋上Mission

- B06が追加した`gym-rooftop`を正本Mission Location一覧から読み、Player／NPC通常Location Missionの有効候補として扱う。Location IDや体育館屋上座標をRuntimeへ直書きしない。
- Player Mission HUDは`3F 体育館屋上へ行く`と表示し、Playerが`area-gym-rooftop`へ進入した時点で完了する。
- NPC通常Location Missionは体育館屋上Anchorへ移動し、危険・同行・Alarmの既存優先順位と期限継続を維持する。
- activeなPlayer MissionではT06-3ミニマップへ`gym-rooftop` Location IDを渡し、Mission終了時に目標を外す。
- Mission候補の重み、Player通常最大3件、NPC通常最大8件、1tick最大2件は変更しない。

## 推奨設定

- モデル: GPT-5.6 Sol
- リーズニング: High
- 選定理由: 既存のミニマップ、Mission、HUD、入力ライフサイクルを維持しながら限定的な修正と実動作回帰が必要である。

## ステップ

- [ ] P1の再現手順、期待結果、対象batchを計画へ固定する
- [ ] B06後も残る場合だけ、屋上入口の複数NPC停止snapshotを引き継ぐ
- [ ] 校庭／校舎外周の現在地表示とMission候補非追加をB06確定資産で受け入れる
- [ ] 3F 体育館屋上のPlayer／NPC Mission、HUD、ミニマップ目標をB06確定資産で受け入れる
- [ ] B06統合済みの最新`develop`から専用branch／worktreeを作成する
- [ ] 再現fixtureまたは同一条件の実画面確認を追加する
- [ ] 対象Runtime/UIだけを修正する
- [ ] typecheck、build、fixture、Web／Electron、consoleを検証する
- [ ] 計画結果を更新し、対象差分だけをcommitする

## 結果

未着手。具体的な対象batchはP1で確定する。
