# HAIGURE SURVIVAL v2 B03-3D 荒れ版教室配置 計画

更新日: 2026-08-01

## プロンプト

> 通常版の教室内容が確定した後、通常版ではなく荒れ版の各教室の中身の配置を、新しい別タスクで相談して決めたい。荒れ版の相談と、次の機能タスクを並行して進めたい。

## 目的

PR #60で確定した通常版配置を保護基準とし、20室の既存`disordered` variantを現状比較から一室ずつ相談・承認して、強い荒れ版の見た目、Collider、遮蔽、歩行可能な倒れ物、Room Variant NavMeshを一致させる。

## 対象外

- 通常版配置の再設計。承認された個別修正を除き、`normal` variantを変更しない。
- F／E／C・G／N／H、音声、水中速度、時間増援、複数開始地点などのT06 Runtime実装。
- NPC／BIT AI、扉・エレベーター状態機械、追跡性能の変更。
- `docs/plan.md`、`docs/plans/v2/next_tasks_plan.md`の並行branchからの更新。

## 依存と開始条件

- Wave 0Gの計画Pull Requestが`develop`へ統合済みであること。
- PR #59、PR #60、PR #61を含む最新`origin/develop`から専用branch／worktreeを作ること。
- Blenderが未保存状態で起動している場合は既存セッションを操作せず、専用プロセスまたは非対話生成だけを使うこと。

## ファイル所有

- 単一編集: `scripts/v2/build_b03_school_architecture.py`、対応監査器、学校Blender正本、学校GLB、静的人間用NavMesh、Room Variant NavMesh bundle、BIT用NavMesh、`src/world/stageCatalog.ts`の学校hash、荒れ版比較画像、本計画。
- 編集禁止: `src/v2/**`、学校動的Runtime、T04／T05 fixture、T06-1計画、全体計画。
- `.blend`、GLB、NavMesh、生成器、カタログhashは本branch以外から同時編集しない。

## 実行単位と推奨設定

- 推奨ブランチ: `codex/v2-b03-3-disordered-classrooms`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: High
- 理由: 主作業は視覚比較とBlender資産の単一編集だが、20室×表示・Collider・遮蔽・NavMeshの整合を保つ必要があるため。
- 並行可否: T06-1とだけ並行可能。T06-1は学校バイナリ、生成器、カタログhash、`src/world/**`を変更しない。

## ステップ

- [ ] 最新`develop`から専用branch／worktreeを作り、通常版・荒れ版20室の資産契約とhashを監査する
- [ ] 変更前の通常版と荒れ版を同じ視点・照明・解像度で各室比較できる画像にし、差分一覧を提示する
- [ ] 普通教室と各特別室について、倒す・移動する・散乱させる物、通路、使用不能／使用中の見せ方をユーザーと相談する
- [ ] ユーザー承認前はBlender正本、生成器、GLB、NavMesh、カタログhashを変更しない
- [ ] 承認済み内容だけを生成正本へ実装し、通常版の表示・Collider・遮蔽・NavMeshが不変であることを監査する
- [ ] 各荒れ版で少なくとも1つの出入口と室内主要経路を確保し、倒れた机・棚・箱山をプレイヤーと全NPCが歩ける形状・NavMeshへ一致させる
- [ ] 20室×2 variant、所有Volume、扉、エレベーター、Navigation Area／Portal、通常・ビーム視線Colliderの契約を監査する
- [ ] 学校GLB、3種NavMeshを連続2回生成してbytes／SHA-256一致を確認し、カタログhashを同期する
- [ ] 通常版と荒れ版0／2／10、代表経路、扉・エレベーター、NPC／BIT、視線・ビームをfixture、実ブラウザ、Electronで回帰する
- [ ] 結果を本計画へ記録し、実装・検証・commit・push・Pull Request作成まで行う。レビュー、merge、worktree整理は別タスクとする

## 完了条件

- 20室すべての荒れ版がユーザー承認済み比較画像と一致する。
- 通常版はPR #60基準から意図しない変更が0件である。
- 荒れ版の表示、Collider、遮蔽、Room Variant NavMeshが同じ配置を表す。
- すべての荒れ版に通行可能な出入口と主要経路があり、倒れ物の歩行契約を満たす。
- 資産監査、決定性、型検査、build、fixture、実ブラウザ、Electronに合格する。

## 次タスク開始用プロンプト

> 最新`origin/develop`から`codex/v2-b03-3-disordered-classrooms`と専用worktreeを作成し、B03-3Dを開始してください。最初にPR #60の通常版と現行荒れ版20室を同条件の画像で比較し、各室の差分と変更候補を提示してください。私が配置を承認する前は、Blender正本、生成器、GLB、NavMesh、カタログhashを変更しないでください。承認後は学校バイナリを単一担当で更新し、通常版不変、荒れ版の表示・Collider・遮蔽・Room Variant NavMesh一致、全室の通行可能性を検証してください。`src/v2/**`、T06-1、全体計画は編集しないでください。実装・検証・commit・push・Pull Request作成までを対象とし、レビューとmergeは行わないでください。GPT-5.6 Sol / Highを使用してください。

## 結果

未着手。Wave 0Gでは実装せず、相談開始前の比較、承認境界、資産単一編集、T06-1との並行条件を確定した。
