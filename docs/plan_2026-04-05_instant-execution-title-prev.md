# タイトル画面「いきなり公開処刑モード」追加 計画

更新日: 2026-04-05

## プロンプト
「いきなり公開処刑モード」ボタンを、タイトル画面に追加してください。
- ボタンの位置は「全てデフォルトに戻す」の左
- ボタンの色は「全てデフォルトに戻す」の黄色バージョン
- タイトル画面での「いきなり公開処刑モード」仕様
　- 「いきなり公開処刑モード」ボタンは「通常モードに戻る」ボタンに変わる。押すと通常モードに戻る。
　- 「左クリック：開始」のテキストは「いきなり公開処刑モード」に変更。左クリックをしても開始しないようにする。
    - SETTINGSパネルのうち、PLAYER SETTINGSとVISUAL SETTINGSはそのまま残り、値も適用される。STAGEやVOLUMEも残る。
    - DEFAULT SETTINGS、BRAINWASH SETTINGS、BIT SETTINGSは非表示になる。
    - 空いたスペースには、以下の設定を表示する。
      - EXECUTE SETTINGS
        - 処刑方法：プルダウンメニュー（値は下記）。デフォルト「プレイヤーをビットが処刑」
          - 「プレイヤーをビットが処刑」：player-survivorかつビットが処刑する。
          - 「プレイヤーをNPCが処刑」：player-survivorかつNPCが処刑する。ビットは出現しない。このとき「周囲のビット(体)」は入力不可になる。
          - 「NPCをビットが処刑」：npc-survivor-npc-blockかつビットが処刑する。
          - 「NPCをNPCが処刑」：npc-survivor-npc-blockかつNPCが処刑する。ビットは出現しない。このとき「周囲のビット(体)」は入力不可になる。
          - 「NPCをプレイヤーが処刑」：npc-survivor-player-block
        - 処刑対象NPC(人)：スピンボックス要素。デフォルト0。
          - 処刑方法が「NPCを～」に変わったときに値が0なら、自動で1になる。 処刑方法が「NPCを～」のとき、0以下に変更することはできない（1になる）。
          - 最大値は、処刑方法が「NPCを～」なら6、「プレイヤーを～」なら5。（※この5という数字には、最後のx人が拘束されたら公開処刑モードに以降する定数を用いること）
          - 処刑方法が「プレイヤーを～」に変わったときに値が6なら、自動で5になる。 処刑方法が「プレイヤーを～」のとき、6以上に変更することはできない（5になる）。
        - 周囲のNPC(人)：スピンボックス要素。デフォルト11。最大値は99。処刑対象NPC(人)の数＋（処刑方法が「プレイヤーを～」なら1追加）よりも少なくすることはできない。少なくしようとすると自動で最小値になる。
        - 周囲のビット(体)：スピンボックス要素。デフォルト10。最大値は99。処刑対象NPC(人)の数＋（処刑方法が「プレイヤーを～」なら1追加）よりも少なくすることはできない。少なくしようとすると自動で最小値になる。
        - 「処刑開始」ボタン：黒地に白文字。上記の設定通りに公開処刑が開始される。NPCのスプライトやボイスの選択は、通常モード開始時と同様にランダム。
    - 「いきなり公開処刑モード」中の「全てデフォルトに戻す」ボタンは、「公開処刑設定のみデフォルトに戻す」にテキスト変更。EXECUTE SETTINGS内のみデフォルトに戻す効果になる。なお「全てデフォルトに戻す」ボタンは、EXECUTE SETTINGSの設定もデフォルトに戻す。
    - EXECUTE SETTINGSの内容も、localStorageに保持すること。
- タイトル画面の「いきなり公開処刑モード」中は、まだカメラをマウスに合わせて追従しないでください。マウスカーソルも消さないでください。
- EXECUTE SETTINGS内の各種入力ボックスの大きさや文字の大きさは、通常モードの他SETTINGSに揃えてください。今は文字が大きすぎます。
- EXECUTE SETTINGSの文字と、処刑方法の間にもう少し隙間を開けてください。
- EXECUTE SETTINGSの各種入力フォームの間にもう少し隙間を開けてください。「出現間隔(秒)」と「最大数」の間と同じだけ空けてください。
- EXECUTE SETTINGSの文字と、処刑方法の間がまだ狭いです。もっと空けてください。
- 「いきなり公開処刑モード」時のパネルの横幅を、あと10px左に広げてください
- 文字と入力欄の右側は元通りの隙間になるようにしてください。
- パネルの中の文字、とくにプルダウンメニューの文字が長くて隠れてしまっているので、それを表示するためにパネル自体の幅を広げたかったのです。文字の表示域をちゃんとパネルの中いっぱいまで広げてください。もちろん適切な余白は保ったままです。いいですね？
- あのー、そんなに広げないでくださいよ。さっき指示した10pxぶんくらいでちょうどよかったのに、どうしてこんなにひろげちゃったんですか？プルダウンメニューの中で一番長い文字は「プレイヤーをビットが処刑」です。これが表示できれば十分です。

実装計画:

# タイトル画面「いきなり公開処刑モード」追加 計画

## 概要
- 既存の計画ファイルは新タスク用に退避し、新しい計画へ切り替えて更新する。
- タイトル画面に「いきなり公開処刑モード」への切替ボタンと `EXECUTE SETTINGS` を追加し、通常開始とは別に公開処刑へ直接入る開始経路を作る。
- 回答反映:
  - ルーレットステージ選択中でも、本モードではルーレット本編へ入らず公開処刑を開始する。
  - `NPCをプレイヤーが処刑` では `周囲のビット(体)` は未使用にする。

## 実装変更
- タイトル設定モデルに `ExecuteSettings` を追加する。項目は `method`、`targetNpcCount`、`surroundingNpcCount`、`surroundingBitCount`。
- localStorage 保存データに `executeSettings` を追加し、保存バージョンを 6 へ上げる。既存データ移行時は execute settings の既定値を補完する。
- 初回表示は通常モード固定にし、execute settings の値だけ復元する。通常設定パネルの値はそのまま保持する。
- 右下ボタン群を横並び化し、新ボタンを既存リセットボタンの左へ置く。通常時は `いきなり公開処刑モード`、切替後は `通常モードに戻る` にする。
- 新ボタンは既存リセット系ボタンの黄色版スタイルにする。
- instant mode 中はタイトル文言を `いきなり公開処刑モード` に差し替え、左クリックで `startGame()` しないよう入力分岐を止める。pointer lock 要求だけは従来どおり維持する。
- instant mode 中は `PLAYER SETTINGS`、`VISUAL SETTINGS`、`STAGE`、`VOLUME` だけ残し、`DEFAULT SETTINGS`、`BRAINWASH SETTINGS`、`BIT SETTINGS` を隠して、その位置へ `EXECUTE SETTINGS` を表示する。
- `EXECUTE SETTINGS` には以下を実装する。
  - `処刑方法` プルダウン。値は 5 種固定で、既存 execution variant と `usesNpcVolley` の組み合わせへ対応づける。
  - `処刑対象NPC(人)` 数値入力。`NPCを～` に切り替わった時に 0 なら 1 へ補正する。`プレイヤーを～` の上限は `publicExecutionMaxSurvivors - 1`、`NPCを～` の上限は 6 にする。
  - `周囲のNPC(人)` 数値入力。最小値は `処刑対象NPC + (プレイヤーを～なら1)`、最大 99。
  - `周囲のビット(体)` 数値入力。bit 使用モードでは最小値は `処刑対象NPC + (プレイヤーを～なら1)`、最大 99。`プレイヤーをNPCが処刑`、`NPCをNPCが処刑`、`NPCをプレイヤーが処刑` では入力不可かつ開始時 0 扱いにする。
  - `処刑開始` ボタン。黒地白文字にし、クリックで設定どおりの公開処刑を開始する。
- 入力補正ロジックは UI 側で即時反映する。無効な値へ変更しようとした場合はその場で仕様上の最小値または最大値へ戻す。
- 通常モードの `全てデフォルトに戻す` は execute settings も含めて全リセットする。instant mode 中は同じ位置のボタン文言を `公開処刑設定のみデフォルトに戻す` に変え、execute settings のみ既定値へ戻す。
- 通常 `startGame()` とは別に `startInstantExecution()` を追加する。ここでは hidden にした `DEFAULT/BRAINWASH/BIT` 設定は使わず、`PLAYER/VISUAL/STAGE/VOLUME + execute settings` だけを使用する。
- instant execution 用の準備リクエストを別に持ち、総 NPC 数を `処刑対象NPC + 周囲NPC` にした上で、通常開始と同様のランダムなスプライト・ボイス割当を行う。
- instant execution 開始時は reset 後に NPC と bit を execute settings に合わせて再構成し、対象 NPC、周囲 NPC、プレイヤー状態、`blockedByPlayer`、`blockTargetId`、`usesNpcVolley`、`survivorTargets`、`playerExecutionRole` を明示的に組んだ `ExecutionConfig` を生成して `enterPublicExecution()` へ渡す。
- bit 使用モードでは指定数の bit を生成して execution 円配置に使う。NPC 処刑役モードとプレイヤー処刑役モードでは bit を生成しない。
- ルーレットステージ選択時も、ステージ地形はそのまま使うが `roulette` フェーズへは入らず、instant execution 専用経路で直接 `execution` へ入る。

## ステップ
- [x] 既存の `docs/plan.md` を退避し、新しい計画ファイルを作成する
- [x] `ExecuteSettings` 型・保存・デフォルト値・localStorage 正規化を追加する
- [x] タイトル画面に instant mode 切替 UI と `EXECUTE SETTINGS` パネルを追加する
- [x] instant mode 中の文言・表示制御・左クリック開始抑止を追加する
- [x] `startInstantExecution()` と instant execution 用の準備経路を追加する
- [x] instant execution 用の NPC/bit 再構成と `ExecutionConfig` 生成を実装する
- [x] リセット挙動を通常モード用と公開処刑設定専用に分岐する
- [x] `npm run build` で確認し、結果を計画ファイルへ反映する

## 結果
- 既存の `docs/plan.md` は `docs/plan_2026-04-05_public-execution-threshold-prev2.md` へ退避し、本タスク用の計画へ切り替えた。
- `src/ui/executeSettings.ts` と `src/ui/executeSettingsPanel.ts` を追加し、`ExecuteSettings` 型、処刑方法 5 種、対象NPC数・周囲NPC数・周囲ビット数の補正ルール、`EXECUTE SETTINGS` パネルを新設した。bit 未使用モードでは `周囲のビット(体)` を入力不可にし、bit 使用モードへ戻した際は必要最小値へ補正する構成にした。
- `src/ui/titleSettingsStorage.ts` は保存バージョンを 6 へ移行し、`executeSettings` を localStorage の保存・復元対象へ追加した。旧保存データ読込時は execute settings の既定値を補完しつつ正規化する。
- `src/ui/titleSettingsSidebar.ts` は instant mode 切替ボタン、`EXECUTE SETTINGS` の表示切替、公開処刑設定専用リセット、通常リセット、`処刑開始` コールバックをまとめる構成へ拡張した。通常モードでは既存パネル群を表示し、instant mode では `DEFAULT SETTINGS`、`BRAINWASH SETTINGS`、`BIT SETTINGS` を隠して `EXECUTE SETTINGS` を表示する。
- `src/style.css` は instant mode 切替ボタンの黄色スタイル、右下ボタン横並びレイアウト、`EXECUTE SETTINGS` の入力行と `処刑開始` ボタンの見た目を追加した。
- `src/main.ts` はタイトル準備データへ `executeSettings` を組み込み、title ready 文言を通常時 `左クリック：開始`、instant mode 時 `いきなり公開処刑モード` へ切り替えるよう変更した。タイトルでの左クリックは instant mode 中に通常開始せず、pointer lock 要求も止める構成にしたため、マウスカーソルが消えず、カメラもマウス追従を始めない。
- `src/game/publicExecutionConfig.ts` を追加し、公開処刑人数しきい値や待ち時間定数を共有化した。`ExecuteSettings` 側の NPC 上限もこの定数を参照するよう統一した。
- instant execution 用の準備経路を `startInstantExecution()` として追加し、通常開始とは別に総 NPC 数を `処刑対象NPC + 周囲のNPC` としてランダムなスプライト・ボイス割当を行うようにした。ルーレットステージ選択中でも `roulette` フェーズへは入らず、選択中ステージ地形のまま公開処刑へ直接遷移する。
- instant execution 開始時は通常 reset 後に NPC と bit を execute settings に合わせて再構成し、`player-survivor`、`npc-survivor-npc-block`、`npc-survivor-player-block` の各 `ExecutionConfig` を明示的に生成して `enterPublicExecution()` へ渡すようにした。`NPCをプレイヤーが処刑` では保存済み bit 数は維持しつつ、開始時には使用しない。
- リセット挙動は、通常モードでは従来どおり全設定既定値へ戻し、instant mode 中は `EXECUTE SETTINGS` のみ既定値へ戻す分岐へ変更した。
- `src/style.css` の `EXECUTE SETTINGS` 入力欄は、数値入力幅を既存設定パネルと同等に狭め、フォントサイズも 13px へ固定して通常モードの他 SETTINGS と揃えた。
- `npm run build` を実行し、`vite build` と `tsc -p tsconfig.electron.json` の成功を確認した。タイトル画面上での手動操作確認は未実施。
- 追修正後に `npm run build` を再実行し、pointer lock 抑止と EXECUTE SETTINGS の入力サイズ調整後も `vite build` と `tsc -p tsconfig.electron.json` の成功を確認した。
- 追加調整として、`src/style.css` の `EXECUTE SETTINGS` は `処刑方法` 行のラベルとプルダウンの間隔を広げ、各入力行の間にも 9px の縦余白を追加した。
- さらに `src/style.css` と `src/ui/titleSettingsSidebar.ts` を追修正し、`EXECUTE SETTINGS` 見出し直下の縦余白を追加したうえで、instant mode 中の設定パネルは右端を維持したまま左方向へ 10px 広がるようにした。
- 追加で `src/style.css` を調整し、instant mode 中に 10px 広げた分の余白が左側の中身にも反映されるよう、設定パネルの余白方向を見直して文字や入力欄も左へ揃えた。
- さらに `src/style.css` を調整し、instant mode 中の設定パネルは右側の余白だけ通常時と同じ 14px に戻すよう再調整した。
- 最新の追修正では `src/style.css` の instant mode 用設定を見直し、padding ではなく `title-settings-combined-panel` 自体へ最小幅を与えたうえで、`EXECUTE SETTINGS` の `処刑方法` プルダウンはパネル内の残り幅いっぱいまで広がるように変更した。これにより長い選択肢文字列も適切な余白を保ったまま表示しやすくした。
- 最後に `src/style.css` を再調整し、過剰だった instant mode 用の最小幅指定は撤回した。`EXECUTE SETTINGS` の `処刑方法` 行だけを 200px 幅へ絞って広げ、一番長い「プレイヤーをビットが処刑」が見える程度の増分に戻した。
