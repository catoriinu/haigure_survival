# T06-2 光線と窓ガラスの奥行き描画修正 計画

更新日: 2026-08-09

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

## 結果

前回commit `96fd6a7`で通常ビーム本体・先端へ追加した`needDepthPrePass`が、今回のプレイヤービーム消失の直接原因だった。Babylon.jsの透明depth pre-passはvertex／instance alphaとalpha cutoffを適用するcolor passより先に深度を書き、カメラからほぼ同軸に伸びる実ビームでは、透明な後端側面が本体奥側・先端・軌跡を自己遮蔽していた。前回のGPU fixtureは通常Meshによる大きな代替形状であり、実Cylinderの後端fade、hardware Instance、実寸、FPS同軸投影を再現していなかったため、この回帰を検出できなかった。

通常ビームの4種（本体・先端・軌跡・遮蔽物命中演出）を、元のalpha blendで色だけを描く`alphaIndex=150`の可視Instanceと、同じ形状・変形・vertex alpha・instance alphaを持つ`alphaIndex=160`のdepth proxy Instanceへ分離した。depth proxyはcolor writeを行わず、alpha cutoff `0.1`以上の可視部分だけ深度を書き、`alphaIndex=200`の窓ガラスへ前後関係を渡す。可視ビーム自身は深度を書かないため、本体・先端・軌跡は互いを消さない。ガラスが奥ならビームが手前に残り、ガラスが手前ならガラスがビームへ重なる。各可視Instanceとproxyはpool内で一対として取得・opacity同期・解放・破棄する。

T06 GPU fixtureへ実`createV2BeamSystem`を使うplayer-gun回帰を追加し、実Cylinder・先端・軌跡を透視カメラから同軸表示した。実測RGBAはガラスなし中心`[245,45,181,255]`、外周`[253,46,188,255]`、奥ガラスあり中心`[245,45,181,255]`、手前ガラスあり中心`[63,128,246,255]`、ビームalpha 0後の奥ガラス`[35,124,225,255]`だった。奥ガラスはビーム色を変えず、手前ガラスだけが前面へ描かれ、fade後はproxyも深度を解放することを確認した。交差fixtureは奥側`[41,0,204,255]`・手前側`[204,0,0,255]`、密集fixtureは`[255,46,189,255]`となり、本体・先端・軌跡の重なりでもビームが消えない。

`npm run typecheck:v2`、`typecheck:t05`、`typecheck:t06`、`typecheck:t06-2`、`build`、`build:renderer`、`build:t05`、`build:t06`、`build:t06-2`はすべて成功し、`build:renderer`内のV2依存監査もPASSした。5176のブラウザーfixtureはT05が314/314、T06が68/68、T06-2が22/22で、いずれも`data-validation-status=passed`、console warning/error 0件だった。通常ゲームもseed 10で12秒以上確認し、playing、学校、NPC 50体、BIT 20体、複数BEAMの継続描画、console warning/error 0件を確認した。

独立した最終差分監査でも、描画順、depth proxy Material、親子変形、opacity同期、poolの再利用・clear・dispose、実GPU fixtureにP0～P2の指摘はなかった。

変更はT06-2本体branch内のRuntime 2ファイル、検証2ファイル、計画1ファイルに限定した。主worktreeの未追跡ファイル、学校資産、Blender session、5182のserverには変更を加えていない。5176はユーザー確認用に維持し、pushとPR更新は行わない。
