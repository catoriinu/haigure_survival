# タイトル進捗数＋ドット表示 計画

更新日: 2026-03-10

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# タイトル進捗数表示 計画

## 要約
- タイトル中のローディング文言を `NOW LOADING {completed} / {total}` 方式へ変更する。
- 進捗数はハードコードせず、毎回その場で必要な読込単位数から計算する。
- キャラ画像ディレクトリ数は、実際に今回割り当てられたユニークなディレクトリ数と未読込キャッシュ数に応じて可変にする。

## 進捗数の定義
- カウント対象は `stage JSON` と `未読込ポートレートディレクトリ` のみ。
- 生の画像ファイル枚数、BGM/SE/voice 実ファイル、Babylon のメッシュ生成やローカルCPU処理は数えない。
- 起動時 total は次で動的算出する。
  - `stageTaskCount = STAGE_CATALOG.length`
  - `portraitTaskCount = assignVoiceIds()` 後に得られる `getAssignedPortraitDirectories()` のユニーク数のうち、未読込ディレクトリ数
  - `total = stageTaskCount + portraitTaskCount`
- タイトル中のステージ切替時 total は次で動的算出する。
  - `stageTaskCount = 1`
  - `portraitTaskCount = 切替後 resetGame で必要になる未読込ポートレートディレクトリ数`
  - `total = stageTaskCount + portraitTaskCount`
- タイトル復帰時 total は `未読込ポートレートディレクトリ数` のみ。`0` 件ならローディング表示は出さない。
- 分子は各論理単位が完了した時点で `1` ずつ増やす。割り当て重複でユニーク数が減る場合も、その実数をそのまま使う。

## 実装変更
- `main.ts` に内部用の進捗セッションを追加する。
  - `total` と `completed` を保持し、`setTotal` / `advance` / `finish` で文言を更新する。
  - 表示は `NOW LOADING {completed} / {total}` 固定にし、ドットアニメーションは廃止する。
- 初回起動シーケンスは 1 本の進捗セッションで管理する。
  - 最初の `loadStageJson(stageSelection)` 完了で `advance`
  - `Promise.all` で読む残り stage JSON は各完了ごとに `advance`
  - 初回ポートレート読込は `assignVoiceIds()` 後に未読込ユニークディレクトリ数を求め、その数だけ total に加え、各ディレクトリ完了ごとに `advance`
- `ensurePortraitManagers` は「配列を並列読込する関数」のまま使い、進捗反映用に「各 directory 完了で `advance` するラッパー」を `main.ts` 側に追加する。
- `ensurePortraitManagersIfNeeded` / `rebuildCharacters` / `resetGame` は進捗セッションを受け取れるようにして、呼び出し元ごとに total を事前確定する。
- `applyStageSelection` は `1 + 未読込ポートレートディレクトリ数` を total にして、stage JSON 読込から `resetGame` 完了まで同じセッションで表示する。
- `returnToTitle` は事前に未読込ポートレートディレクトリ数を計算し、`0` ならローディング表示なし、`>0` ならその数を total にして `resetGame` に渡す。
- `portraitSprites.ts` の現行の非同期分割合成は維持し、進捗更新点は `SpriteManager` が使える状態になったタイミングに揃える。

## 公開API / 型
- 公開API変更なし。
- 内部変更として、`main.ts` 内の以下に進捗セッション引数を追加する。
  - `ensurePortraitManagersIfNeeded(directories, session?)`
  - `rebuildCharacters(session?)`
  - `resetGame(session?)`
- HUD の公開インターフェースは増やさない。

## テスト
- `npm run build` が成功すること。
- コールドスタート時、表示が固定値ではなく `STAGE_CATALOG.length + 未読込ポートレート数` から始まること。
- 同じ設定でも、重複割り当てや既読キャッシュ状況によって total が変動すること。
- タイトル中のステージ切替で `1 + 未読込ポートレート数` の進捗表示になること。
- ゲームオーバー後のタイトル復帰で、未読込ポートレートがなければ表示しないこと。
- 読込失敗や `null` stage JSON でも分子が止まらず、最終的にローディングが閉じること。

## 前提・既定値
- `19` のような固定 total は使わず、毎回ランタイム計算する。
- キャラ画像ディレクトリは「今回割り当てられたユニーク directory 数」を基準にし、人物や起動回による変動をそのまま表示へ反映する。
- 実装時は `docs/plan.md` を 2026-03-10 更新として差し替える。

追加入力:
- . が増減するアニメーションを、進捗表示と併用したいです。
- 以前同様、NOW LOADINGの後ろにピリオドをアニメーションさせてください。
- なおアニメーションによって進捗表示の文字位置がずれないようにするため、両者の位置は別管理してください。
- 分子が2桁になったときにも `NOW LOADING` の位置がずれないようにしてください。
- 進捗欄は 3 桁 / 3 桁ぶんの幅を確保してください。

## ステップ
- [x] タイトル文言実装とスタイルを確認し、ドット表示追加方針を確定する
- [x] `main.ts` と `src/style.css` を修正し、ドットアニメーションと進捗表示を別要素で管理する
- [x] `npm run build` でビルド確認を行う
- [x] 実装結果を `docs/plan.md` の結果へ反映する

## 結果
- タイトル中のローディング文言は引き続き `NOW LOADING {completed} / {total}` ベースとしつつ、`NOW LOADING` の直後にピリオドを `0 → 1 → 2 → 3 → 0` で 0.3 秒ごとに循環表示するようにした。
- ピリオド部分と進捗数部分は別 DOM 要素で管理し、ピリオド用に 3 文字幅、進捗数用に `999 / 999` 相当の固定幅を確保して、桁数が増えても `NOW LOADING` の位置がずれないようにした。
- 進捗 total は固定値を使わず、起動時・タイトル中のステージ切替時・タイトル復帰時それぞれで、`stage JSON` 件数と未読込ポートレートディレクトリ件数から動的算出する。
- ポートレート割り当ては先に 1 回だけ確定し、その同じ割り当てを `resetGame` / `rebuildCharacters` まで引き回すことで、表示中の total と実際の読込対象がずれないようにしている。
- `loadStageJson()` が `null` を返した場合でも、タイトルのステージ名は既存ラベルを使って進行できる。
- `npm run build` は成功した。手動での起動確認とタイトル画面での表示確認は未実施。
