# HAIGURE SURVIVAL v2 I0 B03-3C・T04-3A・T05-3統合ゲート 計画

更新日: 2026-07-28

## プロンプト

> 今現在、T05-3をT04-3Aに取り込み、それをさらにB03-3Cに取り込んで、そこからdevelopにPull Requestを作ろうとしています。

> 新しい機能を多く追加しているため、早めに重い動作確認を行いたいです。統合Pull Requestを作成してdevelopへマージする前に、重い動作確認を行ってください。

B03-3C統合headで、取り込み済みのT04-3AとT05-3を含む統合差分を完成させる。`docs/plan.md`、`docs/plans/v2/next_tasks_plan.md`、B03-3／T04-3／T05-3計画、資産・Runtime仕様、ブランチ戦略を読み、学校バイナリ、動的空間、NPC指示の差分を保持する。競合解消、統合回帰、V0第1重点ゲート、commit、push、`develop`向けPull Request作成までを対象とする。B04以降の実装、`develop`へのmerge、review threadのresolveは対象外とする。

2026-07-28 人間受入修正指示:

> 現在は開閉可能な扉がすべて閉じた状態で始まり、教室やトイレ内を確認できません。今回の確認中は、教室とトイレの開閉可能な扉をすべて開いた状態でゲームを開始するよう固定してください。
>
> 開閉可能な教室引き戸には、手を掛ける長方形の取っ手を両面へ付けてください。トイレ個室の開き戸には、開く方向の外側へ丸い握りノブを付けてください。開閉できない扉には取っ手を付けないでください。
>
> 全トイレ個室の扉と入口幅が合っていません。扉が個室を閉じられる大きさへ広げ、必要に応じて仕切り壁も調整してください。
>
> 自分が被弾していない時にも、他キャラクターの光線命中付近で画面全体がフラッシュし、壁が一瞬消えたように見える問題の原因を特定して修正してください。
>
> 光線命中球そのものは維持し、周囲へ映る間接照明を弱めてください。通常壁など光線を通さない遮蔽物の向こうへは漏らさず、窓や柵など光線を通す遮蔽物越しの漏光は許容します。
>
> 体育館舞台を左右それぞれ0.5～1.0m広げ、階段も同じ量だけ左右へ追従させ、舞台袖の壁を短くしてください。

2026-07-28 標的選択個性の計画指示:

> NPCとBITについて、取得済み標的を基本的に追い続ける個体と、最も近い可視標的へ常に切り替える個体を50%ずつ発生させたいです。BIT生成時とNPC洗脳時に個性を確定し、実現可能性と早期実装できるタスク配置を調査して今後のプランへ組み込んでください。

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
- [x] 人間受入画像、学校`.blend`、扉生成、体育館形状、命中演出、通常ゲーム入口を読み取り監査する
- [x] NPC／BIT標的選択個性の実現可能性を確認し、T05-4とI0後のB04並行Waveを全体計画へ追加する
- [x] 通常ゲーム開始時に教室引き戸38件とトイレ開き戸24件を全開初期化し、動的空間indexを開姿勢で再構築する
- [x] 教室引き戸の両面取っ手、トイレ外側ノブ、個室を閉鎖できる扉幅、左右0.8m拡張した舞台・階段・短縮袖壁を生成正本へ実装する
- [x] NPC命中球の内面全画面描画、PBR PointLightの広域漏光、通常壁を無視する間接照明を修正する
- [x] Blender、GLB、静的人間NavMesh、room variant bundle、BIT NavMesh、カタログhash、代表画像を再生成・監査する
- [x] 型検査、build、T02／T04／T05 fixture、通常Web、Electron、console、再読込、破棄を回帰する
- [x] 人間受入修正の結果を各計画へ記録し、UTF-8 BOMなし、ローカル絶対パスなし、括弧対応、`git diff --check`を確認してローカルcommitする
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

同日、人間受入で扉初期姿勢、取っ手、トイレ個室閉鎖、命中時フラッシュと間接照明、体育館舞台幅の修正指示を受けた。読み取り監査では、通常ゲームが扉Runtimeを生成していないためGLBの閉姿勢で始まること、トイレ個室ピッチ1.40mに対して扉幅が0.90mであること、舞台を左右0.80m広げても袖階段・開口へ干渉しないことを確認した。命中演出はNPC球まで両面描画され、カメラが球内へ入ると発光内面が全画面を覆う。さらに強度1.1のPointLightがPBR材で意図したrangeに収まらず、遮蔽判定なしで壁越しに点滅することを原因として特定した。修正と再生成・回帰は未完了である。

同じ調査でNPC／BITの既存最近傍可視探索を再利用できることを確認し、`persistent`／`nearest-visible`を個体別50%ずつ割り当てるT05-4を追加した。I0後は学校バイナリだけを所有するB04と、AI Runtimeだけを所有するT05-4を並行し、両方の`develop`統合後にT04-3Bを開始する。詳細契約は`docs/plans/v2/T05-4/plan.md`へ記録した。

同日、通常ゲームのStage読込直後に扉Runtimeを生成し、教室引き戸38件とトイレ開き戸24件だけを全開にした。エレベーター扉3件は初期状態を維持し、開姿勢Transformへ移した62扉と静的Colliderを含む完全な動的空間集合を同一revisionで再構築する。T04では閉位置のCollider消失、開位置のCollider出現、破棄後利用拒否、再読込後の62扉再初期化まで固定した。

学校正本には引き戸38件の両面長方形取っ手、トイレ扉24件の通路側丸ノブ、幅1.40mの扉板を追加した。体育館舞台は40.60～52.20mの11.60m幅へ左右各0.80m拡張し、左右階段、Ramp、階段上部壁、袖壁を追従させた。最終監査はBlender／GLB 1,684 Object、契約765 Object、通常604 VIS、全荒れ624 VIS、扉65件、取っ手38件、ノブ24件、20室×2 variant、所有tile重複0件、不一致0件を確認した。

NPC命中球は裏面カリングを有効にし、player命中球だけ両面描画を維持した。PointLightは強度0.4、glTF falloffへ変更し、active cameraから命中中心への`castBeamSegment`が不透明壁または閉扉へ命中する間は強度0とする。窓・柵などbeamを通す形状は従来どおり漏光を許可する。poolのNPC→player→NPC再利用、遮蔽切替、fade中の復帰をT05へ固定した。

最終公開値はGLB 15,440,072 bytes／`aeb89be6c5ef550fef8627c85486c186afc47ba0eefbf113558a91282eeccbd9`、静的人間NavMesh 3,124,800 bytes／`6a35b416eb7069fdb9e8eff5fa9c62f6ce2d6febc9f28765b6041213ad448dd1`、room variant bundle 1,911,013 bytes／`78a0f481aae3abd6a6e403c60fc0debc1c70941c8b7956f17e35006df10c3afd`、BIT NavMesh 568,363 bytes／`c60c44187e8eeca0889a933b564bb7eab936728148f43e5dd1796c57e82d8d73`である。人間用とBIT用の`--check`は二重生成一致を含めて通過し、カタログhashを同期した。

V2依存監査、通常・T01～T05 buildは全件成功した。実ブラウザはT02 48/48、T04 104/104、T05 254/254、T05-3 16/16で、各専用タブのconsole warning／errorは0件だった。通常Webは最新学校の開始画面までwarning／error 0件で読み込み、build済みElectronは実クリックで`playing`へ遷移してNPC 50体、BIT、BEAM、着弾更新を継続した。Electron DevToolsはBabylon.jsのWebGL2初期化情報1件だけでwarning／error 0件だった。

最終配布検査は変更Python 7ファイル、Node 1ファイルの構文、変更テキスト31ファイルのstrict UTF-8、BOMなし、ローカル絶対パスなし、競合marker 0件、TypeScriptの全buildによる括弧対応、`git diff --check`を通過した。独立レビューはP0／P1なし、T05-4の同距離規則にP2 1件だった。`persistent`の初回取得を既存frame／source順、`nearest-visible`だけ対象ID順へ訂正し、T05・T07へ同期した再レビューで解消を確認した。
