# 初回起動ポートレート最適化 計画

更新日: 2026-02-15

## プロンプト
わかりました。結論としては案1の、
事前生成を減らす。noGunTouchBrainwashBlendStepCount を 64→8/16 に下げる＋必要ディレクトリだけ遅延生成。
をお願いします。カウントは16で。

READMEにnoGunTouchBrainwashBlendStepCountを挙げるほど切り替わりが滑らかになるが、起動時の読み込み時間が長くなることを記載してください。

## ステップ
- [x] `src/game/portraitSprites.ts` の `noGunTouchBrainwashBlendStepCount` を16へ変更
- [x] `src/main.ts` のポートレート事前全件ロードを廃止し、必要ディレクトリのみ遅延ロードする仕組みに変更
- [x] `resetGame/startGame/returnToTitle/applyStageSelection` の呼び出し順を非同期ロードに合わせて調整
- [x] `README.md` の説明とデフォルト値を実装に合わせて更新
- [x] `npx tsc -p tsconfig.json --noEmit` で型チェック

## 結果
- `src/game/portraitSprites.ts` の `noGunTouchBrainwashBlendStepCount` を `16` に変更した。
- `src/main.ts` の起動時ポートレート一括生成を廃止し、`ensurePortraitManagers(...)` で割り当て済みディレクトリのみ遅延生成する構成へ変更した。
- キャラクター再生成前に必要ディレクトリの読み込みを待つため、`rebuildCharacters`/`resetGame`/`startGame`/`returnToTitle` を非同期化し、呼び出し側を `void` 呼び出しに更新した。
- `applyStageSelection` でタイトル中の再初期化時に `await resetGame()` するよう更新した。
- ステージ切替完了まで `stageSelectionInProgress` を維持し、切替中の `startGame` を抑止するようにした。
- `README.md` に `noGunTouchBrainwashBlendStepCount` の説明を追記し、デフォルト値を `16` に更新した。
- `npx tsc -p tsconfig.json --noEmit` を実行し、成功した。
