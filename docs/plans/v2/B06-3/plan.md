# HAIGURE SURVIVAL v2 B06-3 小物・表札・Web配布対応 計画

更新日: 2026-08-17

## プロンプト

> 洋式便器をタンク、台座、楕円形の便器開口、便座が分かる低ポリ形状へ変更する。
>
> 小便器を閉じた卵形ではなく、壁側背面、外殻、内側の受け面、開口、排水部が分かる中空形状へ変更する。
>
> 普通教室は`1-1`形式、特別教室等は日本語名を表示する。男女トイレと男女更衣室は文字を併記せず、共通の男女別ピクトグラムを再利用する。
>
> 日本語はリポジトリ所有の再配布可能なフォントsubsetから決定的にAtlas生成し、端末依存フォントを使用しない。

2026-08-11 追加指示:

> 音楽室のピアノは鍵盤付近の重複面によるちらつきをなくす。宙に浮いているペダルへピアノ本体から支持棒・連結部を追加し、低ポリの範囲で本体、鍵盤、脚、ペダル周辺のディテールを少し増やす。

2026-08-17 実装指示:

> B06-2はPR #73で実質完了済みと確定し、計画・ロードマップだけを完了状態へ同期する。B06-2を再実装しない。
>
> 最新`origin/develop`から`codex/v2-school-props-signage`と専用worktreeを作り、B06-3を実装・検証・ローカルcommitまで進める。
>
> 配布対象はitch.ioのブラウザ版と、GitHubからソースを取得してViteで起動するローカルブラウザ版とする。Electronは実装・検証・配布対象外とする。
>
> 公式Noto Sans JP太字から、表札、数字、ハイフン、「調整中」に必要なglyphだけをsubset化する。subsetの内部名を`Haigure Signage Subset`として原本と区別し、著作権・OFL metadataを維持する。`LICENSES/`へOFL 1.1全文とFONTLOGを置き、取得元commit、原本／subset SHA-256、使用glyph、subset化手順を記録する。
>
> PillowとfontToolsを固定し、`SignsPaper`を2048×1024・8×8の固定tile順で生成する。システムフォント、CDN、glyph fallbackを廃止し、欠落glyph、未知sign ID、重複tileは生成エラーにする。
>
> 普通教室は2階`3-1`～`3-3`、3階`2-1`～`2-3`、4階`1-1`～`1-3`とする。特別室は保健室、図書室、職員室、PC室、生徒会室、放送室、理科室、美術室、家庭科室、LL教室、音楽室とする。付帯表札は主玄関、北通用口、プールとする。男女トイレ・男女更衣室は文字なしの男性／女性ピクトグラム各1tileを再利用する。体育倉庫には表札を置かない。
>
> エレベーター「調整中」もsubsetからMesh生成し、`WINDIR\Fonts\meiryob.ttc`依存を廃止する。HUDのCSSフォントは変更しない。
>
> 洋式便器へタンク、台座、外側ボウル、楕円形の凹んだ開口、便座リングを設ける。小便器を壁側背面、左右外殻、開いた上面、内側受け面、排水部を持つ中空形状へ変更する。
>
> ピアノは本体・鍵盤台・鍵盤面の重複領域を境界で分割し、一つの面を一つの部品だけが描画する。微小offsetやDepth Biasは使用しない。白鍵・黒鍵、3本の脚、ペダル台、2本のペダル、本体から続く支持棒を追加する。
>
> 配置、既存Object名、Collider寸法、部屋用途を変更しない。NavMesh 3種はhash不変とする。小物ライブラリ`.blend`、学校`.blend`、GLB、Atlas、監査器、カタログhashを同期する。
>
> itch.io版は`npm run build:renderer`で生成した`dist/`だけをアップロードする。生成用subset TTFはproduction `dist/`へ含めない。`dist/`にはAtlas PNG、文字Mesh入りGLB、第三者ライセンス表示を含める。
>
> GitHub版はソース一式にsubset TTF、OFL、FONTLOGを含める。利用者は`npm ci`後に`npm run dev:web`でローカルHTTPサーバーから起動する。`file://`によるHTML直接起動は対応対象外とし、READMEへNode.jsと起動手順を記載する。

2026-08-17 実ブラウザ確認追加指示:

> 音声やキャラクタースプライトが読み込めるように修正する。
>
> 今回修正した小物と、ゲーム内での確認観点をまとめる。

## 目的

P1-PROP-01～02とP1-SIGN-01～03を小物・表札の正本から修正し、用途が判別できる衛生器具と、全校で一貫した教室名・ピクトグラムを実装する。

## 開始条件

- B06-2はPR #73のB06-1へ吸収され、`develop=79f038d`で実質完了済みである。
- 現行小物正本、SignsPaper Atlas生成、全表札の配置一覧、リポジトリ所有フォントと再配布条件を監査済みである。
- `codex/v2-school-props-signage`の専用worktreeを使用する。

## 実装範囲

- 洋式便器をタンク、台座、楕円開口、便座が判別できる低ポリ形状へ変更する。
- 小便器を壁側背面、外殻、内側受け面、開口、排水部を持つ中空形状へ変更する。
- 普通教室を学年・組の`N-N`形式、特別教室等を日本語名で表示する。
- 男女トイレ・男女更衣室は文字を併記せず、共通の男女別ピクトグラムを再利用する。
- リポジトリ所有の再配布可能な日本語フォントsubsetからSignsPaper Atlasを決定的生成する。
- 音楽室ピアノの鍵盤重複面を解消し、本体からペダルへ支持棒・連結部を追加して、低ポリの詳細を増やす。
- 表札manifestにsign ID、表示内容またはpictogram ID、Atlas tile、対象部屋、配置Transformを作者資産として固定する。
- エレベーターの`調整中`を同じsubsetから実Mesh化し、Windowsフォント絶対パス依存を除去する。
- Noto Sans JP由来subset、OFL 1.1、FONTLOG、第三者ライセンス表示を配布方式に応じて所有する。
- itch.io用production `dist/`とGitHubソース取得後のVite起動手順を整備する。
- Git管理対象外の既存ローカル音声・キャラクター画像を、共有資産を移動・複製せずB06-3専用worktreeの開発Webサーバーから読み込めるようにする。
- 今回変更した洋式便器、小便器、ピアノ、表札、エレベーター`調整中`のゲーム内確認観点を整理する。

## 対象外

- 部屋用途、入口位置、トイレ個室数、器具数、Colliderの用途変更は行わない。
- 端末フォント探索、欠落文字の別フォントfallback、外部CDNフォントは使用しない。
- HUDのCSSフォント、Runtimeの公開TypeScript API、B06-4、T06-4P、Electron実装・build・受入・パッケージングは変更しない。
- `file://`によるHTML直接起動、フォント単体販売、ゲーム本体ライセンスへのOFL subset取り込みは行わない。
- ライセンスと配布可否を未確認の音声・キャラクター画像バイナリはGit、production `dist/`、itch.io配布物へ追加しない。

## 受入条件

- 洋式便器と小便器が正面・斜め・側面の3視点で用途と開口を判別できる。
- 小便器は閉じた卵形でなく、内側へ注げる中空形状である。
- 全普通教室・特別教室・付帯室の表札が対応入口の壁にあり、1920×1080で読める。
- 男女トイレ・男女更衣室は文字0件で、同じ男女別ピクトグラムassetを再利用する。
- 同一入力からsubset、Atlas、GLBのbytes／SHA-256と、小物・学校`.blend`のScene意味監査署名が2回一致し、端末依存パスを含まない。
- ピアノは鍵盤のちらつきが0件で、ペダルが本体から支持され、正面・斜め・側面で鍵盤、脚、ペダル機構を判別できる。
- `調整中`はsubset由来の実Meshで、GLBと生成記録にWindowsフォント絶対パスがない。
- 3種NavMeshのbytesとSHA-256はB06-3開始時から不変である。
- production `dist/`にTTFがなく、Atlas、GLB、第三者ライセンス表示がある。
- GitHubソースは`npm ci`と`npm run dev:web`で起動でき、READMEにNode.js、HTTP起動、`file://`対象外を記載する。
- B06-3専用worktreeの開発Webサーバーでは、既存ローカル音声とキャラクター画像のcatalogが空でなく、代表ファイルが正しいMIME typeで配信される。
- タイトル設定で自キャラと自ボイスを選択でき、選択したCharacter画像と音声を通常ゲーム入口から読み込める。

## 検証

- subset、Atlas、GLBを各2回生成してbytes／SHA-256を比較し、小物ライブラリと学校`.blend`は保存済みScene署名と実形状から再計算した意味監査署名を比較する。Blender 5.2では意味が同一のSceneを再保存してもraw `.blend`のbytes／SHA-256が変化することを実測しているため、raw値は参考記録とし決定性の正本にはしない。
- 全表札、20室、主玄関、北通用口、プール、全階男女トイレ、男女更衣室について、欠落、重複、文字併記、入口干渉を監査する。
- 洋式便器、小便器、ピアノを正面・斜め・側面で確認し、ピアノは接近・遠距離・移動中もちらつき0件とする。
- Collider、Room Variant、動的扉、エレベーター契約とNavMesh 3種のhash不変を確認する。
- T02、T04、`npm run build:renderer`、Vite開発サーバー、production `dist/`のローカルHTTP配信を実ブラウザで検証する。
- 1920×1080で表札の可読性、Player移動、Pointer Lock、再読込、console warning／error、Babylon Loggerを確認する。
- UTF-8 BOMなし、`git diff --check`、構文・括弧、ローカル絶対パス混入を検査する。

## ゲーム内確認観点

- 洋式便器は2～4階トイレの合計18基を確認する。正面では背面タンク、台座、外側ボウル、便座リング、楕円開口、斜めでは凹んだ内側受け面と排水部、側面ではタンク・ボウル・台座の前後関係を見る。
- 小便器は2～4階トイレの合計9基を確認する。正面では開いた上面、内側受け面、排水部、斜めでは壁側背面、左右外殻、外殻の厚みと中空部、側面では壁からの張り出しと給水部を見る。閉じた卵形に見えないことを重視する。
- グランドピアノは4階音楽室の1台を確認する。白鍵14、黒鍵10、脚3、ペダル2、ペダル台、本体から続く支持棒2を正面・斜め・側面で見分け、接近・遠距離・視点移動中の鍵盤付近に横縞や点滅がないことを見る。
- 表札は1階の保健室、図書室、職員室、PC室、主玄関、北通用口、2階の`3-1`～`3-3`、生徒会室、放送室、理科室、3階の`2-1`～`2-3`、美術室、家庭科室、4階の`1-1`～`1-3`、LL教室、音楽室、屋上のプールを確認する。全階男女トイレと屋上男女更衣室は文字なしの男女ピクトグラムだけで、体育倉庫には表札がないことが正しい。
- 表札共通では1920×1080での可読性、床別背景色、文字化け・欠落・重複0件、対応入口の壁への配置、扉・通路・プールアクセスへの干渉0件を見る。保健室北側表札は通常版・荒れ版の両方で同じ文字と位置を維持する。
- エレベーター`調整中`は2階・3階で4文字と×印テープを確認し、文字欠け、四角表示、再読込後の消失がないことを見る。見た目ではなく、Windows font依存を廃止してNoto Sans JP subset由来の実Meshへ変更した点が今回の修正である。
- 小物の配置、既存Object名、Collider外形、部屋用途、トイレ器具数、Room Variant、動的扉、エレベーターRuntime、NavMesh 3種、Runtime公開TypeScript API、HUDのCSS fontは変更していない。

## ステップ

- [x] B06-2のPR #73吸収完了、最新`origin/develop`、専用branch／worktreeを確認して計画を同期する
- [x] 現行便器形状、表札一覧、フォント取元、配布契約を監査する
- [x] Noto Sans JP太字subset、OFL、FONTLOG、決定的Atlas生成を実装する
- [x] 洋式便器・小便器を小物正本から修正する
- [x] ピアノの鍵盤重複面、ペダル支持、低ポリ詳細を小物正本から修正する
- [x] 全校表札、男女ピクトグラム、`調整中`Meshを正本へ反映する
- [x] Atlas、小物ライブラリ、学校`.blend`、GLB、監査、カタログhash、Web配布資産を同期する
- [x] 決定性、資産監査、全表札、3視点比較、T02／T04、開発Web／production Webを確認する
- [x] 結果を更新してB06-3差分だけをcommitする
- [x] 専用worktreeで音声・キャラクター画像が欠落する原因と配布境界を確認する
- [x] 共有資産を変更せず、専用worktreeの開発Web入口へ既存ローカル音声・キャラクター画像を接続する
- [x] HTTP、asset catalog、タイトル設定、通常ゲーム入口で音声・Character画像の読込を確認する
- [x] 今回変更した小物・表札・`調整中`のゲーム内確認観点と追加結果を記録する

## 結果

2026-08-17、dirtyな既存`develop`と未保存のBlender画面を保持したまま、最新`origin/develop=79f038d`から`codex/v2-school-props-signage`と専用worktreeを作成した。B06-2はPR #73へ吸収済みとして完了同期し、B06-3の実装、検証、ローカルcommitを完了した。

Noto CJKの固定commit `f8d157532fbfaeda587e826d4cd5b21a49186f7c`にあるNoto Sans JP太字を41 codepointへsubset化し、`Haigure Signage Subset`として所有した。原本は9,590,732 bytes／SHA-256 `F4B373B226668EE33A6E54B02823DCD2D1209F17159F777421AE8C2275160369`、subsetは12,520 bytes／`A0818C2E215739934A23872A481772BEFCC5224B65442725D1EB05387CB6A29A`である。OFL 1.1、FONTLOG、取得元、生成手順、原本／subset hashを`LICENSES/`へ記録し、itch.io版とGitHub版の配布手順をREADMEへ追加した。HUDのCSS fontは変更していない。

SignsPaper Atlasは2048×1024、8×8、80,908 bytes／SHA-256 `78F7C1DB74136458F3FF954B2332FF141EAFC1724484D38608D9DF47B72AEB35`へ更新した。manifest SHA-256は`59B8AE13717F8902104C93FEBDF886EA214E191B57451528DC5FE69CF8B14239`、表示tile 25件、配置35件、Room Variant対象20室である。普通教室9室、特別室11室、主玄関、北通用口、プール、全階男女トイレ、男女更衣室を監査し、体育倉庫0件、文字付き男女表札0件、入口・プールアクセス動線干渉0件を確認した。保健室北側表札は通常版と荒れ版の両方へ同じtile／Transformで保持した。エレベーター2階・3階の`調整中`はsubset由来の実Meshで、Windows font pathは`.blend`、GLB、生成記録のいずれにもない。

洋式便器はタンク、台座、外側ボウル、楕円開口、便座リング、小便器は背面、左右外殻、開口、内側受け面、排水部を持つ形状へ更新した。ピアノは白鍵14、黒鍵10、脚3、ペダル2、支持棒2を含む34 componentsとし、鍵盤境界を分割して同一平面の重複、微小offset、Depth Biasを使用していない。9枚の1920×1080固定プレビューと小物監査で正面、斜め、側面を確認した。既存配置、Object名、Collider外形、部屋用途は維持した。

小物GLBは227,912 bytes／SHA-256 `C95123A1EBB7103A6EF58159C1230E12DCB705FDB1904FA51434503989EB3885`、学校GLBは22,422,064 bytes／`16A1B9A87DAC31E4FCB32B791CE6F9E0229E3289A98B2FBC16776064A5B2160D`で、各2回生成のbytes／SHA-256が一致した。小物Scene意味署名は`1D153B5DE379BC1E724BDBDE99AA5D6653C7393238B9CE5CC8B9B8D32C8F698E`、学校Scene意味署名は`597C22872200D2158C4DB51B5D014B980D692CC54F211F900A3A7441210480CD`で、保存済み署名と実形状からの再計算が一致した。Blender 5.2のraw `.blend`は意味が同一でも再保存時のbytes／SHA-256が変化するため参考値とし、決定性判定には意味署名を使用する。人間、Room Variant、BITのNavMeshはそれぞれ`52F7DCBCD09B5DEE685865001BC2DD1E8B98F4BF418688C8F4F01DB0C180A9E4`、`C5D9BD4A021370006A4C9D380EA938720719B2908C2D83AE4509720CCAC74C4C`、`4B3BBD249E00C515DAD333EF29157E5128FC5CF7286CC26655D096E34BE5B499`で開始時から不変である。

小物、内装、建築、Room Variant、保護契約、B04、NavMesh、Web配布監査、`build:t02`、`build:t04`、`build:renderer`は合格した。T04学校統合fixtureは実ブラウザで80/80 PASS、production `dist/`は1920×1080のローカルHTTP配信、再読込、console warning／error 0件を確認した。`dist/`はTTF 0件で、既知hashのAtlas、文字Mesh入り学校GLB、OFL、第三者NOTICEを含む。T02は43/52で、9件のFAILタイトルは`origin/develop=79f038d`の43/52と完全一致し、B06-3由来の新規FAILは0件だった。Pointer Lockはブラウザ自動操作環境がroot documentを有効な入力対象として扱わず取得できなかったため、T04の実Player階段移動と既存入力回帰で代替確認し、この環境制約を未達証拠として記録する。

UTF-8 BOMなし、Python AST、Node構文、括弧、`git diff --check`、ローカル絶対パス混入を確認した。push、Pull Request、レビュー、merge、B06-4、T06-4P、既存worktree整理は行っていない。

同日、実ブラウザ確認用のB06-3専用worktreeにGit管理対象外の`public/audio`と`public/picture/chara`が存在せず、Viteの音声・portrait catalogが空になることを確認した。共有元の既存ローカル資産を移動・複製せず、専用worktreeの同じ公開pathへignored Junctionで接続し、5175番のVite開発サーバーを再起動した。共有実体は音声215ファイル（BGM 1、SE 13、VOICE 201）とCharacter画像136ファイルで、Junctionとバイナリはcommit対象外である。

再起動後、タイトル設定にCharacter画像17ディレクトリとボイス12種が表示された。代表SEはHTTP 200／`audio/mpeg`、VOICEはHTTP 200／`audio/wav`、Character画像はHTTP 200／`image/png`で、通常ゲーム入口はCharacter画像の読込を完了して`playing`へ遷移した。音声・画像由来のconsole warning／errorは0件だった。ブラウザ自動操作環境のPointer Lock `WrongDocumentError`は資産読込とは別の既知制約である。ライセンスと配布可否を未確認の音声・Character画像はproduction `dist/`、Git、itch.io配布物へ追加しておらず、今回の接続は現ローカル開発Webの確認環境に限定する。
