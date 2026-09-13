# HAIGURE SURVIVAL v2 I1 Wave 0Gロードマップ再編 計画

更新日: 2026-08-08

## プロンプト

> 今、通常版の教室配置を別タスクで修正している。通常版の教室内容が確定した後、荒れ版の各教室の配置相談は新しい別タスクで行う。PR #59につながる修正ブランチはコードレビュー後に`develop`へ取り込み、通常版教室配置も`develop`へ取り込んで両成果を統合する。その後、荒れ版配置の相談と並行して進められる次の機能タスクを、過去のプランを確認して整理したい。
>
> 裏タスクでWave 0A～0Dまで進めたつもりなので、`develop`を取り込んで完了状態を確認し、その後の安全なプランを練り直す。少なくとも`develop`をpullして取り込むところまでは実行する。
>
> Wave 0Eの修正を完了したため、pullして`develop`を取り込み、Wave 0Fへ進む。
>
> Wave 0Gをこのタスクで開始する。

## 目的

PR #59～#61までの統合済み`develop`を事実上の起点とし、荒れ版教室配置と次の機能実装を安全に並行できる一ブランチ単位へ再編する。

## 対象外

- Runtimeコード、Blender正本、GLB、NavMesh、カタログhashの変更。
- 既存worktreeやbranchの削除。
- 本ブランチのpush、Pull Request作成、レビュー、merge。
- B03-3D、T06-1、T06-2、T07そのものの実装。

## 実行単位と推奨設定

- 推奨ブランチ: `codex/v2-wave-0g-roadmap`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: High
- 理由: 実装済み状態、バイナリ単一編集、Runtime所有、Pull Request境界を横断して、衝突しない次Waveへ再編する必要があるため。
- 開始条件: PR #59、PR #60、PR #61が`develop`へ統合済みで、ローカル`develop`と`origin/develop`が一致していること。

## ステップ

- [x] `develop`、`origin/develop`、全worktree、未コミット差分、Blender起動状態を監査する
- [x] PR #59～#61の統合履歴と、通常版教室配置・テスト人口50／10／20の反映を確認する
- [x] 現行Runtime、学校資産、全体計画、T06計画、ブランチ戦略を照合する
- [x] B03-3D、T06-1、T06-2、T07へ一ブランチ単位で再編し、依存・所有・並行条件・受入・推奨設定を確定する
- [x] `docs/plan.md`、`docs/plans/v2/next_tasks_plan.md`、`docs/plans/v2/README.md`、T06親計画、`docs/branch_strategy.md`を同期する
- [x] UTF-8 BOMなし、ローカル絶対パスなし、競合markerなし、`git diff --check`、文書間の現行状態を検証する
- [x] Wave 0Gの文書差分だけを単一commitにする

## 結果

2026-08-01、`develop`と`origin/develop`がPR #61のマージコミット`e8f922d`で一致し、ahead／behind 0／0、root worktree cleanであることを確認した。PR #59の実学校動的統合・追跡性能修正、PR #60の通常版教室配置、PR #61の通常テスト人口50／10／20を現行起点とした。

次の実装Waveは、学校バイナリだけを単一編集するB03-3Dと、学校バイナリ・カタログ・`src/world`を編集しないT06-1を並行可能とする。両成果が個別Pull Request、独立レビュー、`develop`統合を終えた後だけT06-2を開始し、複数開始地点、動的出現禁止、出現Volume、時間増援、最終学校E2Eを統合する。T07はT06-2統合後に直列実施する。

2026-08-08、上記Waveは完了した。B03-3DはPR #65、T06-1はPR #64、B03-3D追補はPR #66で`develop=cdb8bae`へ統合済みであり、初回横断統合とT06-2開始ゲートは完了している。現在はT06-2を専用branch／worktreeで開始し、計画初回コミットと視覚承認フェーズを進めている。その後は2026-08-02に追加されたI2、T06-3とB05、T06-4、I3、T06-5を経てT07へ進む。現行順序の正本は`docs/plans/v2/next_tasks_plan.md`とする。
