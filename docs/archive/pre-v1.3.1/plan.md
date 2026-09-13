# ボイス欠損時の継続動作修正 計画

更新日: 2026-04-11

## プロンプト
ボイスファイルがpublic配下に存在しない状態でゲームを開始した解き、以下のエラーが出ました。
ボイスが必ず存在する前提で決め打ちで再生しようとしている箇所はありませんか？
Uncaught Error: Missing voice audio asset: 02_cool/ク_Bここは危険です.wav
    at resolveVoiceUrl (voice.ts:81:11)
    at playOneShot (voice.ts:139:7)
    at updateVoiceActor (voice.ts:198:7)
    at Object.updateVoices (characterScene.ts:684:9)
    at updateVoices (main.ts:3819:18)
    at main.ts:4211:3

なるほど。
「欠損していたら即エラーにする」仕様にはせず、「欠損していてもエラーにはせず、単に再生しないだけでゲームを継続できる」ように修正してください。

## ステップ
- [x] 既存の `docs/plan.md` を `docs/plan_2026-04-11_missing-voice-asset-prev.md` へ退避し、新しい計画書を作成する
- [x] `src/audio/voice.ts` を修正し、欠損しているボイスは再生対象から除外してゲーム継続できるようにする
- [x] `npm run build` で確認し、結果を計画書へ反映する

## 結果
- `docs/plan.md` を今回タスク用に作成し、直前の計画書は `docs/plan_2026-04-11_missing-voice-asset-prev.md` へ退避した。
- `src/audio/voice.ts` で `import.meta.glob()` から得た実在ボイス一覧を使い、再生候補配列から欠損ファイルを除外するようにした。
- 再生候補が 1 件も残らない場合は、その発話だけを無音スキップしてゲーム継続するようにした。
- `brainwash-complete-haigure` の enter 音声が欠損している場合でも、後続処理が止まらないよう `onEnded` コールバックは即時に流す構成にした。
- `npm run build` は成功した。
