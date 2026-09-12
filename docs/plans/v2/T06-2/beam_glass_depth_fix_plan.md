# T06-2 光線と窓ガラスの奥行き描画修正 計画

更新日: 2026-09-12

## 現在の到達点

2026-09-12、過去のdepth proxy方式が奥のBIT・ガラスを不透明に遮り、出現球は別の描画indexにより手前ガラスへ重なることを実GPUで確認した。以下の過去結果は当時の検証記録であり、現在の透過合成の合格を示さない。最新の実装・検証は末尾の再発防止フェーズで管理する。

## プロンプト

> これ別問題です。前に起きてた問題が再発しているように思います。光線の光とガラスが重なって表示されるときに、ガラスの方が手前にあるように見えてしまいます。重なり具合として、画面に見えるのは、まあ、この絵で、この画像で言えば光線の方が手前から奥に向かって飛んでいってるので、実際の位置関係に従って、光線の方が手前に、画面手前にあるようにしてください。プールの問題の後に、これしていってください。
>
> 今メインのスレッドの方で行われているプールの問題の修正と、かち合わないように、ワークスペースやworktreeを分けつつ、同じブランチに最終的に統合されるように修正を始めてください。

> サイドチャットで解決した光線の光の修正について、メインの修正branchへ取り込み、その状態をブラウザー上で確認できるようにしてください。
>
> branch: `codex/v2-t06-glass-beam-depth-fix`
>
> worktree: repo外の専用worktree
>
> commit: `3ba77cd fix(v2): 光線と窓ガラスを深度順に合成`

> ビームの光について、やはり表示順がおかしいです。ガラスよりは手前に表示されているようですが、ガラス全面がピンクになって表示されるのは不自然です。また、プレイヤーが発射して奥へ飛んでいる光線の先端の光の玉と軌跡・光のしっぽが重なり、打ち消し合って光線が見えなくなる状態が起きています。これは今まで起きていなかった現象です。問題を確認してください。

> YES

> 残念、もっと駄目になりました。先ほどより、自分が撃っている光が表示されなくなっています。ガラスより前面にはあると思いますが、光そのものの描画がやはりおかしいです。きちんと確認してください。10層と重なるからどうこうという問題ではありません。手前のものは手前に見える、ただそれだけです。修正してください。

## ステップ

- [x] T06-2本体branchとプール問題の作業状態を変更せず、同じT06-2 HEAD由来の補助branch・worktreeを作成する。
- [x] 既存の透明描画修正とGPU fixtureを確認し、光線がガラス面を横切る交差ケースが未検証であることを特定する。
- [x] 窓ガラスと戦闘光を、実際のピクセル深度に従って透過合成する。
- [x] 光線の手前部分と奥部分を同一画面で検証するGPU回帰テストを追加する。
- [x] T06型検査・build・ブラウザfixtureを実行し、描画結果とconsoleを確認する。
- [x] 補助branchへローカルコミットし、プール問題の修正完了後にT06-2本体branchへ統合できる状態で停止する。

### T06-2本体branchへの統合

- [x] 補助branchとT06-2本体branchの親commit、変更ファイル、clean状態を照合し、プール修正との競合がないことを確認する。
- [x] `3ba77cd`を`codex/v2-t06-school-integration`へcherry-pickする。
- [x] T06とT06-2の型検査・build・GPU fixtureを統合後HEADで再検証する。
- [x] 5176の通常ゲームserverが統合後ソースを配信することを確認し、実ブラウザーで光線・窓ガラス・consoleを確認する。
- [x] 統合結果を実測値へ更新し、計画差分だけをローカルcommitする。

### Scene全体OITによる視覚回帰の修正

- [x] 提示画像、統合前後の差分、Babylon.jsの透明描画経路、実ビーム・Character・ガラスMaterialを照合し、Scene全体OITが既存の`alphaIndex`契約を無効化していることを特定する。
- [x] OITが全透明Triangle Meshをdepth peelingへ集約し、Characterの`forceDepthWrite`、透明球の両面化、既定10深度層、カメラ近傍のtip／trail重なりを同時に引き起こす構造を確認する。
- [x] Scene全体OITを解除し、Character・命中演出・trailを含む既存の透明描画順を復元する。
- [x] ビーム本体・先端をNPCと空間半透明の間で先行描画し、この2種だけへalpha test付きdepth pre-passを適用して、Scene内の他の透明meshを巻き込まない深度合成へ置き換える。
- [x] 実ビーム相当のCylinder・tip／trail球、両面ガラス、`forceDepthWrite`を持つCharacter、10層超の重なりを含むGPU回帰テストを追加する。
- [x] T05・T06・T06-2の型検査、build、ブラウザfixtureを実行し、既存契約と新しいGPU回帰を確認する。
- [x] 5176の通常ゲームで再読込、playing、学校・NPC・BIT・BEAMの継続描画、consoleを確認し、窓越し・窓手前、先端と軌跡、ガラスの色は同一描画経路を使うGPU fixtureで確認する。
- [x] 実装結果を実測値へ更新し、修正をローカルcommitする。pushは行わない。

### 実ゲームのプレイヤービーム消失を再修正

- [x] 提示画像と実ゲームの描画経路を照合し、一次ビームの本体・先端が欠落して二次軌跡だけが見えている症状を切り分ける。
- [x] `needDepthPrePass`とhardware instanceの組合せを実形状・実Instanceで再現し、前回fixtureが通常Meshだけだった検証漏れを確定する。
- [x] ビームのcolor passと同形状のcolor-writeなしdepth proxyを分離し、前後関係だけで後続の窓ガラスを遮蔽する実装へ置き換える。
- [x] 実`createV2BeamSystem`のInstanceをFPSカメラと同軸に置き、先端・本体・軌跡、ガラス前後、fade後を実ピクセルで確認するGPU回帰を追加する。
- [x] T05・T06・T06-2の型検査、build、ブラウザーfixture、通常ゲーム、consoleを再確認する。
- [x] 実装結果を最新の実測値へ更新し、ローカルcommitする。pushは行わない。

## 過去の結果（2026-08-09）

前回commit `96fd6a7`で通常ビーム本体・先端へ追加した`needDepthPrePass`が、今回のプレイヤービーム消失の直接原因だった。Babylon.jsの透明depth pre-passはvertex／instance alphaとalpha cutoffを適用するcolor passより先に深度を書き、カメラからほぼ同軸に伸びる実ビームでは、透明な後端側面が本体奥側・先端・軌跡を自己遮蔽していた。前回のGPU fixtureは通常Meshによる大きな代替形状であり、実Cylinderの後端fade、hardware Instance、実寸、FPS同軸投影を再現していなかったため、この回帰を検出できなかった。

通常ビームの4種（本体・先端・軌跡・遮蔽物命中演出）を、元のalpha blendで色だけを描く`alphaIndex=150`の可視Instanceと、同じ形状・変形・vertex alpha・instance alphaを持つ`alphaIndex=160`のdepth proxy Instanceへ分離した。depth proxyはcolor writeを行わず、alpha cutoff `0.1`以上の可視部分だけ深度を書き、`alphaIndex=200`の窓ガラスへ前後関係を渡す。可視ビーム自身は深度を書かないため、本体・先端・軌跡は互いを消さない。ガラスが奥ならビームが手前に残り、ガラスが手前ならガラスがビームへ重なる。各可視Instanceとproxyはpool内で一対として取得・opacity同期・解放・破棄する。

T06 GPU fixtureへ実`createV2BeamSystem`を使うplayer-gun回帰を追加し、実Cylinder・先端・軌跡を透視カメラから同軸表示した。実測RGBAはガラスなし中心`[245,45,181,255]`、外周`[253,46,188,255]`、奥ガラスあり中心`[245,45,181,255]`、手前ガラスあり中心`[63,128,246,255]`、ビームalpha 0後の奥ガラス`[35,124,225,255]`だった。奥ガラスはビーム色を変えず、手前ガラスだけが前面へ描かれ、fade後はproxyも深度を解放することを確認した。交差fixtureは奥側`[41,0,204,255]`・手前側`[204,0,0,255]`、密集fixtureは`[255,46,189,255]`となり、本体・先端・軌跡の重なりでもビームが消えない。

`npm run typecheck:v2`、`typecheck:t05`、`typecheck:t06`、`typecheck:t06-2`、`build`、`build:renderer`、`build:t05`、`build:t06`、`build:t06-2`はすべて成功し、`build:renderer`内のV2依存監査もPASSした。5176のブラウザーfixtureはT05が314/314、T06が68/68、T06-2が22/22で、いずれも`data-validation-status=passed`、console warning/error 0件だった。通常ゲームもseed 10で12秒以上確認し、playing、学校、NPC 50体、BIT 20体、複数BEAMの継続描画、console warning/error 0件を確認した。

独立した最終差分監査でも、描画順、depth proxy Material、親子変形、opacity同期、poolの再利用・clear・dispose、実GPU fixtureにP0～P2の指摘はなかった。

変更はT06-2本体branch内のRuntime 2ファイル、検証2ファイル、計画1ファイルに限定した。主worktreeの未追跡ファイル、学校資産、Blender session、5182のserverには変更を加えていない。5176はユーザー確認用に維持し、pushとPR更新は行わない。

## 2026-09-12 透明深度の再発防止

### プロンプト

> ビットとガラスと光線の奥行きの表示の仕方がおかしいです。ビットが出現したときの球状の状態がガラスよりも前に見えました。また、ビットに対して光線を自分から向かって撃つと、光線の方が優先されてビットが後ろで見えなくなりました。光線は光を通すので光線の後ろに、奥にうっすらとビットが見えてほしいし、ビットより手前にガラスがあるならガラスは手前にあるんだから、それにうっすら奥にビットが見えていなければいけません。前後関係、奥行き関係について改めて確認し直してください。

> 前にも言ったように、この深さの問題はこの開発中に何十回も起きている問題です。テストコードを強化してください。そしてその上で実装も正しい深度順とか、透明度を重ねて表示するものは表示するというのを、ちゃんとカメラからの見え方で正しくなるように修正してください。

> ここまで一回コミットしてください。（2026-09-12、検証完了後）

### 対象・完了条件

実BIT（出現・通常・fade）と実光線（本体・先端・軌跡・命中演出）、ガラスをカメラからの深度に従って透過合成する。交差面・逆方向の視点でも、手前半透明の奥の色を残し、不透明面の奥だけを遮る。Characterの透明背景・輪郭・拘束帯、壁による遮蔽を回帰確認する。学校GLB等の資産形状、AI、当たり判定は変更しない。既存の屋内出現50%の差分を維持する。テスト・実装修正・検証・記録の完了後、追加指示により屋内出現配分と合わせた1件のローカルcommitまでを対象とする。pushは含めない。

### ステップ

- [x] 現行コードと実GPU再現、過去のdepth pre-pass／OIT回帰、既存テストの不足を照合する。
- [x] 実BIT・実光線・実GLB由来のガラス材質を使うGPU回帰を先に追加し、現行コードの失敗を記録する。
- [x] カテゴリ順や見えない深度proxyに依存せず、画素の深度とalphaから合成する方式を実験・実装する。
- [x] 前後・交差・逆視点・出現／消失・多重光線・Character・壁の回帰を確認し、旧テストの誤った期待を最新の透過契約へ改める。
- [x] 対象型検査・配布build、通常ゲームの実画面とPlayer操作、console・素材読込を確認する（Pointer Lockの自動操作制約は下記へ記録）。
- [x] 独立レビューと実測結果を記録し、確認サーバーを起動したまま報告する。

### 結果

修正前の独立GPU再現では、FPS同軸の光線中心が奥BITの有無にかかわらずRGBA `[251,67,238,255]`で一致し、BITが合成に寄与していない。出現球もfade中はガラスより後に固定描画される。既存T06は78/78 PASSだが、不透明PlaneをBITの代役にしており、実BIT＋実光線の透過を検査していなかった。

実装修正前に`transparentDepthComposition.test.ts`を接続し、新6件中5件の描画不一致を確認した（全体79/84）。出現球と手前PBRガラスは実値`[90,96,100]`に対し独立source-over参照`[109,118,124]`、前光線と奥BITは実値`[238,88,234]`に対し参照`[203,52,196]`。奥ガラスの画素寄与、三者の斜視合成、多重光線でも失敗し、alpha0の非遮蔽はPASS。素材取得の初期URL誤りは本番修正前に訂正し、上記は正しい学校GLB取得後の描画結果である。

深度合成は専用dual depth peelingへ変更した。4回ごとに全画面の未処理深度を1画素へ縮約し、残層がなくなるまで同じフレーム内で描く。35層は20回で完走し、4隅の1画素だけに残る14層、端数resize、空フレーム、RT解放をGPU回帰で確認した。透明材質の片面設定を維持し、不透明な深度の強制書込、光線depth proxy、カーテンpre-passを除去した。

追加回帰から、事前shader compile時にInstanceが0個のtrail／命中光球では、後の初回生成時に`INSTANCESCOLOR`が再判定されずalphaを無視する問題も特定した。最初のInstance生成で材質属性をdirtyにし、実光球のalpha0で奥ガラスだけへ戻ることを確認した。命中光球は修正1行だけを外した外部比較でRED、適用時GREENを確認した。

BITの中心色の追加不一致は、独立参照が通常BIT内部の不透明銃口と本体を距離順に上塗りしていたためだった。通常BITのalpha1をassertしたうえで参照内の不透明深度を有効にし、手前の黒い銃口と奥の灰色本体を別々にも比較する。合成結果の許容誤差は緩めていない。

独立レビューで、camera-facing設定のCharacterだけがSpriteManager経路に残りOITを通らないことを検出した。旧描画を実行するGPU回帰は半透明PNGで`[0,13,229]`となりRED（85/86）。uprightと同じPlane合成経路へ統一し、両向きのPNG alpha 0/128/255、Player fade、壁・光線・ガラス、実寸の拘束帯を確認した。Characterと帯が同一深度のときはpolygon offsetでは分離できず、帯をカメラ側へ実座標0.001ずらす。正面・斜め、両向き、複数拘束IDでも1本・同じ濃さをGPUで確認し、T06は88/88 PASSとなった。

最終Engine破棄時にBabylonが材質plugin factoryを消すライフサイクルも修正した。Scene開始時にfactoryを再登録し、Engine再生成後もalpha0の面が深度層を消費しない。既定rendererの生成直後の破棄と非同期shader compileの競合を避け、最初から専用rendererを設定する。

通常学校の実画面は、DEV限定の`transparentDepthAcceptance=1`を学校受入URLへ併用し、保存値を変更せずPlayer銃あり・BIT1体・Mission無効へ固定して確認した。実際の学校ガラス`VIS_WindowGlass_F01_North_Special_Room02_Set03`の両側、正面・左右斜め、実Player銃の発射を確認した。光線の奥にBITの輪郭・銃口が透け、窓枠はBITを遮り、ガラス部分ではBITへガラス色が重なる。WASDの実キー入力で屋外側のPlayer足元Zが`-12.17937469482422`から`-12.225500280231271`へ移動した。DEV視点変更はPlayerの位置とNavigationAreaの履歴を一緒に更新する。

実画面証拠はGit除外済みの`verification-images/transparent-depth-fix/`へ保存した。`front.png`、`front-player-beam.png`、`left.png`、`right.png`、`reverse.png`、`reverse-player-beam.png`と`normal-game-evidence.json`が確認条件・位置・射撃数を記録する。Chrome 1680×893、seed 20260812、保存設定由来NPC99体、BIT1体静止、敵行動停止の表示検証であり、通常60fps／高負荷120秒の性能受入とは区別する。FPSは同時実行の影響を分離しておらず、今回の変更前後の性能差は未測定。透明層が増えると描画回数が増える方式である。

ブラウザ自動操作からのCanvasクリックではPointer Lockが`WrongDocumentError`で拒否されたため、マウス視点・クリック射撃の通し確認は未確認。射撃はDEVボタンから通常の`requestPlayerGunFire`を呼び、実光線の生成と画面を確認した。最終画面確認中に追加のwarning/errorや素材読込エラーはなかった。BGM・SE・VOICE・Character画像の代表ファイルはHTTP 200と各audio/image Content-Typeを確認し、カタログは空でなく、各音量5でMUTEではない。

最終結果はT06が88/88、T05が341/341、T06-2が31/31 PASS。T05の旧メッシュ数期待をproxy撤去後の6へ修正し、生成直後のtrail alphaは既存fade-in仕様の0として検証した。寸法・前後位置・fade・命中・再衝突防止・pool再利用・clear・disposeの検証は維持する。T05の総数には同じ作業木で別タスクが追加したNPC巡回回帰を含むが、本件ではその実装・テストを編集していない。T05・T06・T06-2のconsole warning/errorは0件。

`typecheck:v2`、`typecheck:t05`（Runtime依存監査込み）、`typecheck:t06`、`typecheck:t06-2`、`build:renderer`が成功した。Web配布監査はPASS、意図しない配布物は0件。Viteの既存chunkサイズ警告は残る。差分・UTF-8 BOMなしを確認し、独立レビューでは追加の修正指摘なし。表示検証UIのDEV限定、設定保存への非干渉、Player再配置の同期、observer破棄も別担当が確認した。これはAIによる検証結果であり、ユーザーの目視承認を記録したものではない。

作業木は正本の`fps_survival20251226`、branchは`codex/v2-default-disorder-bit-count`、基点HEADは`d85b6395ddd6a16fc4fb8f38268e422592ac7861`。2026-09-12の追加指示により屋内出現50%と本件を1件のローカルcommit対象とする。別タスクで進行中のNPC関連差分は維持し、commitへ含めない。pushなし。通常ゲームは`http://localhost:5175/`、描画fixtureは`http://localhost:5175/validation/v2/T06/index.html`、実学校の再現UIは`http://localhost:5175/?schoolVisualAcceptance=B06-1&seed=20260812&transparentDepthAcceptance=1`。5175は本作業木のVite（PID 27028）で、正本の音声・Character素材を使用し、確認用に起動を維持する。
