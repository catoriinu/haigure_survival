# T06-2 光線と窓ガラスの奥行き描画修正 計画

更新日: 2026-08-08

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

## 結果

T06-2本体branch `codex/v2-t06-school-integration` の開始時HEAD `f2c7194`から、補助branch `codex/v2-t06-glass-beam-depth-fix` と専用worktreeを作成した。プール開始地点の修正中であるT06-2本体worktree、`develop` worktree、未保存Blender sessionには変更を加えていない。

既存修正は透明mesh単位の距離sortであり、光線全体がガラスより手前または奥にあるケースだけを検証していた。一本の光線がガラス面を横切る場合はmesh全体へ一つの描画順しか付けられず、手前部分と奥部分を同時に正しく合成できなかった。Stage窓ガラス契約の確定時にBabylon.jsのorder-independent transparencyを有効化し、透明fragmentを実際のピクセル深度順で合成するよう変更した。光を常にガラスより前へ固定する処理は追加していない。

T06 GPU fixtureへ、傾けた戦闘光が窓ガラス面を横切る回帰テストを追加した。同一画面で奥側は `[41,0,204,255]`、手前側は `[204,0,41,255]` となり、ガラスと光がそれぞれ実際の前後関係に従って合成されることを確認した。T06ブラウザfixtureは66/66 PASS、`data-validation-status=passed`、console warning/error 0件だった。`npm run typecheck:v2`、`npm run build:renderer`、`npm run build:t06`、`npm run build:t06-2`も成功した。通常ゲームを専用portで起動し、playing、学校、NPC 50体、BIT、BEAMの描画まで確認した。自動操作環境ではPointer Lock要求だけがブラウザ制約で拒否されたが、今回の変更に起因するRuntime例外は発生していない。

補助branchのcommit `3ba77cd`を、プール開始時の移動修正 `a40ae50`が入ったT06-2本体branchへcherry-pickし、統合commit `8cd5687`とした。変更ファイルはプール修正と重複せず、競合は発生していない。5176の通常ゲームserverが配信する`v2StageTransparentRenderingOrder.ts`にも、統合したorder-independent transparency設定が含まれることを確認した。

統合後HEADで`npm run typecheck:v2`、`npm run typecheck:t06`、`npm run typecheck:t06-2`、`npm run build:renderer`、`npm run build:t06`、`npm run build:t06-2`がすべて成功した。T06ブラウザfixtureは66/66 PASSで、交差光線は奥側`[41,0,204,255]`、手前側`[204,0,41,255]`、console warning/error 0件だった。T06-2ブラウザfixtureも22/22 PASS、console warning/error 0件だった。

5176の通常ゲームを実ブラウザーで起動し、seed 10、体育館中央開始、playing、NPC 50体、BIT 20体、BEAM 2本まで描画されることを確認した。自動開始時のPointer Lock要求はブラウザ自動操作環境の制約で拒否されたが、Runtime例外は発生していない。ユーザー確認用には、5176の通常タイトル画面を新しいタブで読み込み、console warning/error 0件の状態で残した。

統合内容に対する独立レビューではP0～P2の指摘はなかった。検証用serverは停止し、ユーザー確認用の5176と既存の5182は維持する。pushとPR更新は行わない。
