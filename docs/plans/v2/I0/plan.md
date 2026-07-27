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

- [ ] B03-3C、T04-3A、T05-3のhead、status、個別検証結果、所有ファイルを確認する
- [ ] T05-3を含むT04-3A統合headをB03-3Cへ取り込む
- [ ] 競合を解消し、学校バイナリ、動的空間、NPC指示の成果が欠落していないことを差分監査する
- [ ] 共有fixture indexと統合後のテスト入口を更新する
- [ ] 資産監査、型検査、T04／T05 fixture、通常build、Web、Electronを実行する
- [ ] V0第1重点ゲートの実学校受入と破棄・再読込を完了する
- [ ] 全体計画、次タスク計画、B03-3／T04-3／T05-3計画へ統合結果を記録する
- [ ] 統合結果をcommit、pushし、`develop`向けPull Requestを作成する
- [ ] 独立レビューとV0の結果を確認し、必要な指摘対応を行う
- [ ] merge許可後にだけ`develop`へ統合し、最新`origin/develop`からB04を開始できる状態にする

## 結果

計画作成時点では統合中。B03-3BはPR #52、T05-2VはPR #53で`develop`へ統合済みである。T05-3はT04-3Aへ取り込み済みであり、次にT04-3A統合headをB03-3Cへ取り込む。統合Pull Request作成後、`develop`へマージする前にV0第1重点ゲートを実施する。
