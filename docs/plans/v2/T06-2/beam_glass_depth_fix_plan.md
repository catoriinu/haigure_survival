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

## 結果

統合したcommit `8cd5687`のScene全体OITは、透明meshを既存の`alphaIndex`順から一括してdepth peelingへ移していた。そのため、両面描画されるビーム球・軌跡・窓ガラス・`forceDepthWrite`を持つCharacterが同じ透明層を消費し、既定10層を超える重なりでガラス全面がピンク化し、先端と軌跡が打ち消し合う視覚回帰を発生させていた。

Scene全体OITを撤去し、既存の透明描画順を復元した。通常ビームは本体・先端だけを専用の一次Materialへ分離し、NPCの後、窓ガラスなどの空間半透明より前となる`alphaIndex`へ配置した。一次Materialにはalpha test付きalpha blendとdepth pre-passを適用し、各ピクセルの実深度を後続のガラス描画へ渡す。軌跡・遮蔽物命中演出は従来のalpha blendと空間半透明順を維持し、Character、NPC、Alert、カーペット僚機を含むScene内の他の透明meshは変更していない。生成・pool再利用・事前コンパイル・破棄も、分離した2 Materialを同じライフサイクルで扱うよう更新した。

T06 GPU fixtureへ、実ビーム相当のCylinder、先端球、7個の重複軌跡球（両面14層）、両面ガラス、`forceDepthWrite` Characterを同居させる回帰を追加した。実測RGBAはガラス単体`[74,101,110,255]`、ガラス越しビーム`[175,116,184,255]`、Character前面`[208,77,160,255]`、密集した先端・軌跡`[232,43,172,255]`で、ガラス全面の一色化やビーム消失がないことを確認した。単純な前後・交差ケースも、ガラス前面`[41,0,204,255]`、ビーム前面`[204,0,0,255]`となった。

`npm run audit:v2:dependencies`、`typecheck:v2`、`typecheck:t05`、`typecheck:t06`、`typecheck:t06-2`、`build`、`build:renderer`、`build:t05`、`build:t06`、`build:t06-2`はすべて成功した。5176のブラウザーfixtureはT05が314/314、T06が67/67、T06-2が22/22で、いずれも`data-validation-status=passed`となった。通常ゲームもseed 10で12秒間確認し、playing、学校、NPC 50体、BIT 20体、BEAMの継続描画、console warning/error 0件を確認した。自動操作環境ではPointer Lockが許可されないため、プレイヤー自身の発射操作だけはユーザー確認用の5176で行う。最終的に通常タイトル画面を再読込し、ViteとBabylon.jsの初期化後もconsole warning/error 0件の状態で残した。

独立した最終差分監査でも、描画順、Material設定、poolライフサイクル、GPU fixtureにP0～P2の指摘はなかった。変更はT06-2本体branch内のRuntime 4ファイル、検証2ファイル、計画1ファイルに限定した。主worktreeの未追跡ファイル、学校資産、Blender session、5182のserverには変更を加えていない。5176はユーザー確認用に維持し、pushとPR更新は行わない。
