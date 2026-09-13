# VOICEマニフェスト再設計 計画

更新日: 2026-01-25

## プロンプト
「profile.tags」の直下のプロパティ名（tag410やaなど）をキャラクター状態ベースに変更する。ファイル名は今のままにし、json側は「キャラクターID[].状態[]」形式で、どんなファイル名でもキャラクターと状態ごとに読み込めるようにする。実装側も同様にファイル名に依存せず読み込めるようにする。適切なファイルが存在しなければ再生しない（フォールバック無し、無音でスキップ）。
キャラクターIDはjson上で2桁数字。フォルダ名は「キャラクターID{_任意の文字列}」を許可。brainwash-complete-haigureはenter/loopを持たせる。normalとevadeは別配列。READMEのVOICE手順も新形式に合わせて詳細に更新する。idleの意味も説明する。

## ステップ
- [x] 仕様整理: 新しいvoiceManifest構造（ID→状態）と再生契機、idleの扱いを確定する
- [x] voiceManifest.jsonを新形式へ変換し、既存ファイルを状態別に移植する
- [x] voice.tsを新スキーマに合わせて更新し、状態名ベースで再生する
- [x] READMEにVOICEの配置方法/JSON構成/再生契機を詳細に追記する
- [x] 簡易確認: 主要状態の再生パスが空でも例外が出ないことを確認する

## 結果
voiceManifestをID→状態のJSON構成へ移行し、brainwash-complete-haigureのenter/loopと整列ループを分離。voice.tsを状態名ベースで再生する実装へ更新し、配列が空なら無音スキップ。READMEにVOICEの配置方法/JSON構成/再生契機を詳細化。
