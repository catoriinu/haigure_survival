# B03-P 学校小物ライブラリ カタログ

更新日: 2026-07-20

## 位置付け

本書は`assets/blender/v2/B03/b03_school_prop_library.blend`に収録する配置前小物の寸法、衝突、Material、形状予算を記録する。学校本体への配置、最終Atlas、窓、扉、柵、手すりはB03-Pの対象外である。

## 規約

- Blender Metric、1 unit＝1m、Z-up
- 床置き品の原点は底面中央、壁付け品は取付面中央
- 表示Objectは`VIS_Prop_*`、簡略Colliderは`COL_Prop_*`
- Object名とMesh Data名を一致させ、rotationは0、scaleは1
- Materialは共有し、Mesh datablockは共有しない
- Preview用GLBは通常ステージカタログへ登録しない

## 小物一覧

寸法は結合・Transform適用後のObject実測値である。Material欄は`MAT_Prop_`を省略して記載する。床置き原点は底面中央、壁付け原点は取付面中央である。

| Object | 利用予定室 | 実測寸法m | 原点 | 通行 | Collider | 三角形 | Material slot |
|---|---|---:|---|---|---|---:|---|
| `VIS_Prop_ClassroomDesk` | 普通教室 | 0.65×0.45×0.70 | 床置き | 不可 | `COL_Prop_ClassroomDesk` | 96 | Wood、MetalGray |
| `VIS_Prop_ClassroomChair` | 普通教室 | 0.42×0.45×0.78 | 床置き | 可 | なし | 96 | Wood、MetalGray |
| `VIS_Prop_StaffDesk` | 職員室 | 1.40×0.71×0.72 | 床置き | 不可 | `COL_Prop_StaffDesk` | 72 | MetalGray、MetalDark |
| `VIS_Prop_StaffChair` | 職員室 | 0.60×0.60×0.95 | 床置き | 可 | なし | 228 | Fabric、MetalDark、PlasticBlack |
| `VIS_Prop_Blackboard` | 教室、特別室 | 3.60×0.08×1.20 | 壁付け | 可 | なし | 72 | Blackboard、MetalGray |
| `VIS_Prop_StageLectern` | 体育館舞台 | 0.80×0.554×1.099 | 床置き | 不可 | `COL_Prop_StageLectern` | 60 | Wood |
| `VIS_Prop_Urinal` | 男子トイレ | 0.40×0.35×0.65 | 壁付け | 可 | なし | 172 | Porcelain、MetalGray |
| `VIS_Prop_WesternToilet` | トイレ個室 | 0.40×0.70×0.75 | 床置き | 可 | なし | 168 | Porcelain、PlasticBlack |
| `VIS_Prop_LargeWoodTable` | 理科室、図書室ほか | 1.80×0.90×0.72 | 床置き | 不可 | `COL_Prop_LargeWoodTable` | 60 | Wood、MetalGray |
| `VIS_Prop_CleaningLocker` | 各教室、廊下 | 0.90×0.45×1.80 | 床置き | 不可 | `COL_Prop_CleaningLocker` | 120 | MetalGray、MetalDark |
| `VIS_Prop_BaggageLocker` | 各教室 | 1.80×0.45×1.20 | 床置き | 不可 | `COL_Prop_BaggageLocker` | 120 | Wood |
| `VIS_Prop_GrandPiano` | 音楽室 | 1.55×1.45×1.00 | 床置き | 不可 | `COL_Prop_GrandPiano` | 116 | PlasticBlack、Paper、MetalDark、AccentOrange |
| `VIS_Prop_InfirmaryBed` | 保健室 | 2.00×0.90×0.55 | 床置き | 不可 | `COL_Prop_InfirmaryBed` | 72 | Fabric、MetalGray、Paper |
| `VIS_Prop_PcMonitor` | PC室、職員室 | 0.55×0.18×0.45 | 底面中央 | 可 | なし | 48 | PlasticBlack、MetalDark、MetalGray |
| `VIS_Prop_BasketballGoal` | 体育館 | 1.80×0.70×1.05 | 壁付け | 可 | なし | 240 | Paper、AccentOrange、MetalGray |
| `VIS_Prop_VaultingBox` | 体育館 | 1.20×0.60×1.00 | 床置き | 不可 | `COL_Prop_VaultingBox` | 60 | Wood、Fabric |
| `VIS_Prop_Bookshelf` | 図書室 | 0.90×0.32×1.80 | 床置き | 不可 | `COL_Prop_Bookshelf` | 96 | Wood |
| `VIS_Prop_ClosedBook` | 教室、図書室、職員室 | 0.25×0.18×0.025 | 底面中央 | 可 | なし | 24 | Paper、AccentOrange |
| `VIS_Prop_OpenBook` | 教室、図書室、職員室 | 0.44×0.25×0.04 | 底面中央 | 可 | なし | 36 | Paper、AccentOrange |
| `VIS_Prop_PaperStack` | 教室、職員室 | 0.297×0.21×0.025 | 底面中央 | 可 | なし | 12 | Paper |
| `VIS_Prop_SinglePaper` | 教室、職員室、廊下 | 0.297×0.21×0.002 | 底面中央 | 可 | なし | 12 | Paper |
| `VIS_Prop_PencilCase` | 普通教室 | 0.20×0.07×0.05 | 底面中央 | 可 | なし | 12 | Fabric |

## 実測結果

- 表示小物22種、簡略Collider 10種、Library Mesh合計32個
- 表示小物1,992三角形、Collider 120三角形
- 共有Material 9種。全表示Meshのdatablockはsingle-user
- Object名とMesh Data名は全32個で一致し、正本のrotationは0、scaleは1
- 通行不可10種だけに12三角形の箱Colliderを設定
- 教室机、教室椅子、職員椅子、PCモニターの転倒・回転は、専用小物を作らず、Preview内で正本Meshの複製後Transformだけを変更
- 通常状態の教室机・椅子と、本・筆箱の机上配置、単紙の床上配置を組み合わせた小規模な教室散乱見本をPreviewへ収録
- 大型机は全利用先で椅子を収納できるよう、ライブラリ本体から脚同士をつなぐ横棒を撤去した
- ライブラリ`.blend`は163,659 bytes、SHA-256は`2733FC44E18149C6F8D49C32ED79FD7E949AAD827607CA7418D7F4CC580B559A`
- 確認用GLBは181,632 bytes、SHA-256は`5B929F1006B4280EA4CE1A5706C5A31F210EEBB7BABE7AD271412930D154C2AC`
- 確認用GLBはScene 1、Node 32、Mesh 32、Material 9、Camera 0、Animation 0。確認用床、人型、照明、配置例は未収録
