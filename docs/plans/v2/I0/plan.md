# HAIGURE SURVIVAL v2 I0 B03-3C・T04-3A・T05-3統合ゲート 計画

更新日: 2026-07-28

## プロンプト

> 今現在、T05-3をT04-3Aに取り込み、それをさらにB03-3Cに取り込んで、そこからdevelopにPull Requestを作ろうとしています。

> 新しい機能を多く追加しているため、早めに重い動作確認を行いたいです。統合Pull Requestを作成してdevelopへマージする前に、重い動作確認を行ってください。

B03-3C統合headで、取り込み済みのT04-3AとT05-3を含む統合差分を完成させる。`docs/plan.md`、`docs/plans/v2/next_tasks_plan.md`、B03-3／T04-3／T05-3計画、資産・Runtime仕様、ブランチ戦略を読み、学校バイナリ、動的空間、NPC指示の差分を保持する。競合解消、統合回帰、V0第1重点ゲート、commit、push、`develop`向けPull Request作成までを対象とする。B04以降の実装、`develop`へのmerge、review threadのresolveは対象外とする。

## 実行単位と推奨設定

- 統合head: `codex/v2-b03-3-interactive-assets`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: Ultra
- 選定理由: 学校バイナリ、動的空間、扉・エレベーター、NPC指示、T04／T05回帰を同じheadで横断するため。
- 開始条件: B03-3C、T04-3A、T05-3の各実装commitと個別検証が完了していること。
- 所有範囲: B03-3Cの学校`.blend`、GLB、両NavMesh、room variant、T04-3Aの`src/world`とT04 fixture、T05-3のNPC指示とT05 fixture、統合に必要な共有fixture index、全体計画。
- 対象外: B04の外周資産、T04-3Bの実学校NPC統合、T06の通常ゲーム最終接続、T07の性能最適化。
- 並行可否: 単独で実施する。I0完了前にB04のブランチ作成または書込みを開始しない。

## 実行段階

1. 統合・検証・commit・push・Pull Request作成
2. 別タスクによる独立レビューとV0第1重点ゲート
3. 指摘対応確認、`develop`へのmerge、最新`develop`同期、worktree整理、B04開始準備

## V0第1重点ゲート

- B03-3Cの個別扉、エレベーター可動部、20室の通常・荒れvariant、両NavMeshを監査する。
- T04-3Aの動的active set、revision、扉・エレベーター状態機械、人物ゲート、定員、予約、タイルNavMeshを回帰する。
- T05-3のFollow、Leave、局所分離、haigure時間停止、被弾解除、同期射撃を回帰する。
- T04 fixture、T05 fixture、T05-3専用fixtureを同じheadで実行する。
- 実学校で扉、エレベーター、Follow／Leave、同期射撃、動的遮蔽、BIT経路を確認する。
- タイトル復帰、同一Scene再読込、破棄後の購読・予約・Follower・Mesh・NavMesh残留0件を確認する。
- 通常WebとElectron、型検査、対象build、資産監査、決定性、UTF-8 BOMなし、括弧対応、`git diff --check`を確認する。
- 統合差分由来の重大不具合0件をPull Requestへ記録してからmergeする。

## ステップ

- [x] B03-3C、T04-3A、T05-3のhead、status、個別検証結果、所有ファイルを確認する
- [x] T05-3を含むT04-3A統合headをB03-3Cへ取り込む
- [x] 競合を解消し、学校バイナリ、動的空間、NPC指示の成果が欠落していないことを差分監査する
- [x] 共有fixture indexと統合後のテスト入口を更新する
- [x] 資産監査、型検査、T04／T05 fixture、通常build、Web、Electronを実行する
- [x] 全体計画、次タスク計画、B03-3／T04-3／T05-3計画へ統合結果を記録する
- [x] 統合結果をcommit、pushし、`develop`向けPull Requestを作成する
- [ ] Pull Request作成後、V0第1重点ゲートの実学校受入と破棄・再読込を完了する
- [ ] 独立レビューとV0の結果を確認し、必要な指摘対応を行う
- [ ] merge許可後にだけ`develop`へ統合し、最新`origin/develop`からB04を開始できる状態にする

## Pull Request作成後の人間確認観点

- T02で20室の`normal`／`disordered`を切り替え、家具差分、選択外rootの非表示、Collider、人間用NavMesh、扉から室内中央と荒れ家具斜路への通行を確認する。
- T04で教室引き戸38件、トイレ開き戸24件、エレベーター扉3件の閉開表示、人物Collider、視線・ビーム遮蔽、BIT遮断が状態に追従することを確認する。
- T04でエレベーターの初期4階、1階・4階呼出、乗場扉・かご扉、かご移動、人物gate、予約、定員6人、7人目拒否、降車を確認する。
- T05のNPC指示fixtureでFollow、Leave、局所分離、haigure時間停止、被弾解除、Follower同期射撃を確認する。通常ゲームのF／E／C・G／N／H接続はT06の対象であり、I0で実装済みとは判定しない。
- 扉・エレベーター操作後にNPC経路、動的遮蔽、BIT経路が破綻しないことを確認する。全陣営NPCによる実学校ギミックの最終統合はT04-3Bの対象として区別する。
- T05で`BND_WorldLimit`退出時の光線が着弾、ダメージ、Alarm、反射光球を発生せずフェードする契約を確認する。実学校への`BND_WorldLimit`資産追加と`required`化はB04の対象として区別する。
- 通常WebとElectronで開始、Pointer Lock、移動、複数回・長時間のNPC追跡を行い、`DT_OUT_OF_NODES`、移動拘束例外、V2更新停止、console／Babylon Logger／未捕捉例外が0件であることを確認する。
- タイトル復帰、同一Scene再読込、再開始、破棄を繰り返し、入力購読、エレベーター予約、Follower、Mesh、NavMeshの重複・残留が0件であることを確認する。

## 結果

2026-07-28、B03-3C先端へT05-3を含むT04-3A統合head `7b6489b`を取り込み、Git競合0件と意味上の契約差分を解消した。`roomVariantNavmesh`の厳格union、静的NavMeshと40 variant bundle、65扉、1エレベーター、動的空間、NPC指示を同じheadへ接続し、統合結果を`285b590`としてcommitした。Pull Request作成直前にロードマップcommit `9469693`も競合0件で取り込み、I0後の直列順を`B04 → T04-3B → T06 → T07 → v2リリース準備`へ同期した。

事前検証では資産4監査、人物用NavMeshとBIT NavMeshの決定性、V2依存監査、全型検査、通常・T01～T05 build、T02 48/48、T04 103/103、T05 253/253、通常ゲームの複数継続試行、Electron実ウィンドウを通過した。通常ゲームの初期試行で検出したDetour node pool不足は65,535 nodeと固定有向回帰で是正し、探索上限と更新停止は再発していない。切替直後の探索的な並列試行で移動拘束例外を1回だけ記録したが、詳細診断追加後の6セッションと最終Electronでは再発しなかったため、長時間NPC追跡を人間受入の重点項目とする。

この事前検証はDraft Pull Request作成可否の確認であり、V0第1重点ゲートの完了判定ではない。Pull Request作成後、別タスクの独立レビューで実学校の扉、エレベーター、Follow／Leave、同期射撃、動的遮蔽、BIT経路、タイトル復帰、同一Scene再読込、破棄後残留0件を確認し、重大不具合0件を記録してからだけ`develop`へmergeする。

同日、統合branchをoriginへpushし、`develop`向けDraft Pull Request #55「I0 B03-3C・T04-3A・T05-3を統合」を作成した。GitHub再読込ではbase `develop`、head `codex/v2-b03-3-interactive-assets`、OPEN、Draft、MERGEABLEである。V0第1重点ゲート、独立レビュー、`develop`へのmergeは未完了であり、本計画の対応ステップも未完了のまま維持する。
