# HAIGURE SURVIVAL v2 B06 学校資産微修正 計画

更新日: 2026-08-10

## プロンプト

> 学校のモデルや小物のモデルを大きく変えるのではなく、ここの隙間を直してほしい、ちらつきを直してほしい、というような微修正を今後のタスクへ追加したいです。

> 1Fの校庭Areaを細分化し、中央校庭は校庭のまま、校舎・体育館と外周塀の間は「校舎外周」と表示してください。校舎外周はMission目的地に追加せず、現在地表示にだけ採用してください。体育館北側と北校舎の間の通路は、案2として中央校庭の続きにしてください。

> Missionに「3F 体育館屋上へ行く」がなければ追加してください。

## 目的

P1で承認された学校の建築、小物、材質、面重複、隙間、配置、意味資産の小規模修正だけを、学校資産の単一編集規則で実施する。新しい校舎、部屋、ギミック、タイトル設定は追加せず、Mission Location追加は承認済みの体育館屋上1件だけに限定する。

## 開始条件

- P1で修正箇所、期待結果、対象batch、比較画像または確認視点が確定済みである。
- T06-4が`develop`へ統合済みであり、最新学校資産とB05意味資産を再監査済みである。
- 対象batchが1ブランチ・1セッションで完結する。大きい場合は`B06-1`、`B06-2`へ分割する。

## 所有範囲

- 対象箇所に必要な学校生成正本、小物生成正本、`.blend`、GLB、監査器、プレビュー。
- 形状影響がある場合に限る人間用／Room Variant用／BIT用NavMesh再生成とカタログhash更新。
- `docs/plans/v2/B06/plan.md`とB06専用検証成果。

## 対象外

- `src/v2/**`、ミニマップ描画、Mission、放送、タイトルUI、設定永続化。
- 承認されていない部屋・場所、学校全体の再デザイン、新機能追加。
- 見た目だけの修正を理由に、NavMesh、Location、Marker、Volumeを暗黙変更すること。

## 実装・検証契約

- 同一`.blend`、GLB、NavMesh、生成器はB06だけが編集し、他branchと並行編集しない。
- 面重複、法線、深度、材質、AABB、Collider、通路幅、扉・窓干渉を原因別に修正する。
- 変更前後の同一視点画像を残し、指定箇所が直り、隣接箇所へ新しい隙間・ちらつき・めり込みを作っていないことを目視確認する。
- 生成決定性、資産監査、必要なNavMesh到達性、B05意味資産、T02／T04、通常Web／Electronを影響範囲に応じて検証する。
- 修正、検証、commit、push、Pull Request作成を一単位とし、独立レビューとmergeは別単位とする。

## 追加候補batch: 屋上入口・箱Collider

- 屋上階段室から屋上へ入るNPCが出入口で停止する事象を、Alarmだけに限定せず、直接追跡、同行、放送Mission、通常Mission、自律移動で確認する。単体と複数NPCを分け、既存の単体屋上到達テストでは再現しない条件を固定する。
- `COL_RooftopStairExitRamp`、`COL_RooftopFacilityShell`、`COL_StairSystem_NW_4FToRooftop`、開放扉、屋上側NavMeshの幅・段差・重なりを、NPC半径と移動segmentの契約に対して監査する。形状側に原因があれば、屋上への上下双方向到達を維持したまま正本から修正する。
- `COL_B03_SchoolRoofEscapeCrateRamp`と屋上箱の表示／衝突形状を監査し、斜面の正面からは意図どおり登れ、側面からは箱へ食い込まずに衝突する状態へ修正する。段差として登らせる案を採用する場合も、側面から内部へ侵入できないことを受入条件にする。
- 変更前後を同じ屋上視点で比較し、Playerの通常移動・ダッシュ、単体／複数NPC、Alarm以外の移動理由、屋上から階下への復路を実ブラウザまたはElectronで確認する。
- 資産修正後も複数NPCの集中時だけ入口停止が残る場合は、資産側で回避用の暗黙拡幅を行わず、再現snapshotをT06-4Pへ引き継ぐ。

## 承認済みbatch: 1F 校庭／校舎外周Area分割

- 現行`area-courtyard`の14 Area pieceを正本生成器で再分類し、表示専用の`area-school-perimeter`（表示名`校舎外周`、1F、屋外と同じ優先度）を追加する。
- `area-courtyard`には中央校庭と、体育館北側から北校舎との間を東へ抜ける通路を含める。その通路の東端を越えた地点から東側外周へ切り替える。
- 南・西・北の外周塀沿いと、校舎・体育館の外側を回る東側歩行域は`area-school-perimeter`へ割り当てる。同順位Areaを正体積で重複させず、歩行可能NavMeshを未被覆にしない。
- `courtyard` Mission Locationの`areaId`、Anchor、Mission Volume、表示名、navigation locationと、`assembly-courtyard`のAnchor／Volumeは変更しない。校舎外周用のMission Location、Anchor、Volume、集合会場は作成しない。
- 変更対象はB05意味資産を生成する学校生成正本、学校`.blend`、GLB、B05監査、カタログGLB hashとする。歩行形状を変えないため、人間用／Room Variant用／BIT用NavMeshと各NavMesh hashは変更しない。
- 受入条件は、中央校庭と体育館北側通路で`1F 校庭`、南・西・北・東の外側歩行域で`1F 校舎外周`を返し、このArea分割自体ではMission Locationを増やさず、校庭Mission／会場位置が不変であることとする。

## 承認済みbatch: 3F 体育館屋上Mission Location

- 現行の`area-gym-rooftop`、`NAV_B03_Walkable_GymRooftop`、`NAV_B03_Walkable_GymRoofRamp`を変更せず、`B05_MISSION_LOCATION_IDS`へ`gym-rooftop`を追加する。
- `mission_specs`へ`gym-rooftop`を`area-gym-rooftop`／`f03`／`体育館屋上`として追加し、既存の箱積みとRampを避けた体育館屋上中央へMission Anchorと2m四方のMission Volumeを生成する。
- Player Location Missionは`area-gym-rooftop`への進入で完了し、NPC通常Location Missionは生成時に検証済みのnavigation locationへ移動して正本Mission Volume包含で完了する。
- 追加後はMission Location、Mission Anchor、Mission Volumeを各25件とする。既存24件、集合・公開処刑会場、エレベーター、階段、放送卓は変更しない。
- 学校`.blend`とGLB、B05監査、GLBカタログhashを同期する。歩行形状を変えないため、人間用／Room Variant用／BIT用NavMeshと各NavMesh hashは変更しない。
- B05 fixtureで3F Map上のArea／Anchor／Volume、通常版・荒れ版のAnchor到達性、既存24件不変を確認し、T06-4PでPlayer／NPC Mission抽選、`3F 体育館屋上`表示、ミニマップLocation目標を受け入れる。

## 推奨設定

- モデル: GPT-5.6 Sol
- リーズニング: High
- 選定理由: バイナリ単一編集、生成正本、衝突・NavMesh・意味資産を保護しながら、見た目の差分を限定する必要がある。

## ステップ

- [ ] P1の承認済みbatchと対象外を記録する
- [ ] 屋上入口停止と屋上箱側面食い込みを、単体／複数・Alarm／非Alarmで再現し、資産原因の有無を確定する
- [ ] 承認済みの校庭／校舎外周境界を、中央校庭・体育館北側通路・東西南北外周の代表点で固定する
- [ ] 体育館屋上のAnchor／Volume位置を既存箱積み・Ramp・柵と干渉しない代表点へ固定する
- [ ] 変更前の同一視点画像、資産監査、関係Object／生成定義を確認する
- [ ] 正本生成処理から対象箇所だけを修正する
- [ ] `.blend`、GLB、必要なNavMeshとカタログhashを単一担当で同期する
- [ ] 決定性、資産、経路、B05、Web／Electronの対象回帰を完了する
- [ ] 変更後画像を提示し、計画結果を実測へ更新する
- [ ] B06差分だけをcommitし、許可範囲に応じてpush／Pull Requestを作成する

## 結果

未着手。1F 校庭／校舎外周Area分割は案2で承認済みであり、3F 体育館屋上Mission Location追加も承認済みである。T06-4統合後のP1でB06実装batchへ確定する。
