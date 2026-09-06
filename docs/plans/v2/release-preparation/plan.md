# v2.0.0リリース準備 計画

更新日: 2026-09-06

## プロンプト

> v2リリース準備 として、ゲーム本体をv2.0.0にバージョンアップしたいです。
> そしてdevelopからmasterへのPRを作成するところまでやってください。
> また、v1.3.1からのリリースノートを作成してください。

## 対象・完了条件

- ゲーム本体のpackageとlockfileのバージョンを2.0.0に統一し、READMEとリリースノートを更新する。
- v1.3.1タグ `bb3b5c5dd9fff491298e0312e6a8193832b9dc9f` から、PR #84統合済みdevelop `46bc1620823d1298d9e5f2ab533a981d517ab100` までの実装を比較対象とする。
- T07の既知9項目はユーザー許容済みとして引き継ぐ。今回のゲーム機能・資産修正、性能再計測、master／mainへのmerge、タグ作成、GitHub Release公開は対象外。
- 作業ブランチは `codex/v2-release-preparation`。今回の変更だけをcommitし、developへfast-forward反映・push後、リリース先へのPRを作成してhead一致を確認する。
- リモートにはmasterがなく、mainがv1.3.1と同じコミットにある。ユーザー回答「既存のmain宛てに作成する（推奨）」により、最終宛先をmainへ訂正した。

## ステップ

- [x] Git・v1.3.1タグ・PR #84統合・T07の受入を確認する
- [x] 本体バージョンとリリースノート、関連文書を更新する
- [x] build・配布監査、バージョン整合、文書の参照・UTF-8・差分を確認する
- [ ] 対象変更をcommitし、developへ反映・pushする
- [ ] 確定した宛先へdevelopからPRを作成し、remoteとPR headを照合する

## 結果

調査完了。developとorigin/developは一致し、追跡済み差分はなかった。既存の未追跡文書1件とPythonキャッシュ3件は対象外として保持する。T07の受入はユーザー判断による完了であり、既知問題の修正完了や性能基準PASSとは区別する。

バージョンをpackage.jsonとpackage-lock.jsonの計3箇所で2.0.0へ統一した。依存バージョンの変更はない。v1.3.1との履歴・現行Runtime・T07最終受入を照合し、[リリースノート](../../../releases/v2.0.0.md)へ学校、立体移動、Mission、同行者、放送、タイトル、再開始、互換性、既知9項目を記載した。READMEの古い開発途中の状態とLocation件数も現行仕様へ同期した。

検証: `npm.cmd run build`（V2依存監査・型検査・Web生成・配布監査・Electronコンパイル）がPASS。Babylon chunk 4,082.68kBの既存容量警告は残る。配布物へのローカル音声・Character画像・想定外ファイル混入は0件。UTF-8 BOMなし、READMEと新規文書の相対リンク、バージョン3箇所を確認した。

初回検証では既存node_modulesの実行リンクとBabylon依存の欠損があり、lockfileを変更せず`npm.cmd ci --no-audit --no-fund`で復元した。配布ライセンス2件の作業コピーがCRLFだったため、既存.gitattributesのLF指定へ戻し、正本と配布先のハッシュ一致を確認した。ライセンス本文や検証閾値は変更していない。

今回の変更はバージョンmetadataと文書のみで、Runtime・UI・資産の変更はない。通常ゲームの再受入・新規確認サーバー起動は行わず、PR #84の最終Web受入記録を引き継ぐ。独立したbuildログはAI作業領域のproject fps-survival、logs/release-v2.0.0/build.logへ保存した。
