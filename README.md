# fps-survival-20251226

## 起動準備

### 必須手順（ブラウザで起動）
1. Node.js 18 以上（npm 同梱）をインストールする。
   - 公式サイト（https://nodejs.org/）から LTS をダウンロードして実行する。
   - 画面の指示に従ってインストールを完了する。
2. このリポジトリを別PCへ配置する（`public/` は任意）。
   - フォルダごと任意の場所へコピーする。
   - 例: `D:\games\fps-survival-20251226`
3. ターミナルを開き、プロジェクトフォルダへ移動する。
   - Windows の場合: PowerShell を開く  
     例: `cd D:\games\fps-survival-20251226`
   - mac の場合: ターミナルを開く  
     例: `cd /Users/<ユーザー名>/games/fps-survival-20251226`
4. 依存関係をインストールする。
   - `npm install`
5. 開発サーバーを起動する。
   - `npm run dev`
6. ブラウザでアクセスする。
   - `http://localhost:5175`
7. 終了する。
   - PowerShell で `Ctrl + C`

### 任意手順
- `public/` 配下のステージデータやアセットを使う場合は、`public/` フォルダもコピーする。
- BGM を差し替える場合は、`public/audio/bgm/` に `mp3` を配置する。
  - ステージ JSON の `meta.name` と同名の `<name>.mp3` があれば、それを優先再生する。
    - 例: `public/stage/laboratory.json` の `meta.name` が `laboratory` の場合は `public/audio/bgm/laboratory.mp3`
  - 一致するファイルがない場合は、`public/audio/bgm/` 内の `mp3` からランダム再生する。
  - `public/audio/bgm/` に `mp3` が一つもない場合は再生しない。
- SE を差し替える場合は、`public/audio/se/` に以下のファイル名で配置する（形式: `mp3`）。
  - ビットの浮遊音: `FlyingObject.mp3`
  - ビットの警告音: `BeamShot_WavingPart.mp3`
  - ビットが狙いを定める音: `aim.mp3`
  - ビームの発射音: `BeamShotR_DownLong.mp3` / `BeamShotR_Down.mp3` / `BeamShotR_DownShort.mp3` / `BeamShotR_Up.mp3` / `BeamShotR_UpShort.mp3` / `BeamShotR_UpHighShort.mp3`
  - ビームの命中音: `BeamHit_Rev.mp3` / `BeamHit_RevLong.mp3` / `BeamHit_RevLongFast.mp3`
- VOICE を差し替える場合は、`public/audio/voice/` に配置し、`src/audio/voiceManifest.json` に記載されているパスと完全一致するファイル名にする（形式: `wav`）。
  - 例: `public/audio/voice/01_devil/悪_110ハイグレ.wav`
- キャラクター画像（立ち絵）を差し替える場合は、`public/picture/chara/<キャラディレクトリ>/` に配置する（形式: `png`/`jpg`/`jpeg`/`webp`/`gif`/`bmp`/`avif`/`svg`）。
  - ファイル名は以下の8種類を用意する。
    - `normal`
    - `evade`
    - `hit-a`
    - `hit-b`
    - `bw-in-progress`
    - `bw-complete-gun`
    - `bw-complete-no-gun`
    - `bw-complete-pose`
  - 例: `public/picture/chara/05_big_sister/normal.png`
  - キャラディレクトリ名の先頭2文字が音声IDと一致すると、そのVOICEのキャラとして割り当てられる（例: `05_big_sister`）。
