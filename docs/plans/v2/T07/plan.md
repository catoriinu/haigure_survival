# HAIGURE SURVIVAL v2 T07 性能・回帰試験・仕様書 計画

更新日: 2026-08-23

## プロンプト

> V2の学校1ステージを回帰試験し、1080p・既定設定で60fpsを目標に調整してください。Web版とElectron版をビルドし、3Dステージ実行仕様、技術仕様、Blender資産仕様を最新実装へ更新してください。

> 最終的には最低でもNPC 99人、BIT 50機、Player 1人の負荷へ耐えられることを確認してください。荒れ度10、動的扉、エレベーター、Follower、同期射撃、標的選択個性も有効にしてください。

> I3の判断によりリアルタイム鏡面反射は追加しません。99 NPC／50 BITは60fps要件ではなく120秒の安定性stress上限とし、既定通常構成の60fps目標と分けて確認してください。

## 目的

完成したタイトル・設定・学校Runtimeを、既定通常構成の性能目標と最大構成の安定性上限に分けて検証する。最適化後のWeb／Electron最終回帰と仕様書同期を完了し、v2リリース準備へ引き渡す。

## 開始条件

- T06-6Dが独立レビュー後に`develop`へ統合済みである。
- P2のリリース必須修正が0件で、必要な修正がすべて`develop`へ統合済みである。
- `codex/v2-t07-regression-docs`の専用worktreeを最新`origin/develop`から作成する。

## 性能契約

### 既定通常構成

- 1920×1080、タイトル既定値のNPC 50、初期洗脳済み20%、BIT初期1・10秒増援・最大25、荒れ度2、Mission ON、Alarm OFF、ミニマップ・放送・早期自動公開処刑ONで計測する。
- 描画込み総frameの目標をp95 16.7ms以下、p99 25ms以下、最大50ms以下、50ms超Long Task 0件とする。開始直後10秒と定常戦闘60秒を別々に報告する。
- 解像度、人口、既定品質、Character画像、光線演出、ミニマップ、Missionを無効化した値で代用しない。

### 最大安定性stress

- Player 1、NPC 99、初期洗脳済み66、BIT 50、荒れ度10、20室の荒れvariant、多数の動的扉、稼働エレベーター、無制限Follower、同期射撃、`persistent`／`nearest-visible`混在を有効にする。
- 60fpsを合格条件にせず、120秒完走、diagnostics・warning・error 0件、終了後の保持リーク0件、固定baselineに対する主要frame time・heap指標の悪化5%以内を合格条件とする。
- I3固定baselineはframe work p95 27.1ms／p99 31.4ms、総frame p95 33.5ms／p99 34.0msとする。同一端末、同一解像度、同一seed、同一計測区間で比較する。
- リアルタイム鏡面反射、反射専用camera、`MirrorTexture`は有効化せず、性能項目にも含めない。

## 機能・安全回帰

- T05-1の半径0.54m移動包絡、床・直上天井、別BIT NavMesh、`aperture`／`vertical`／`surface-route`／`boundary`を維持する。
- V1相当の光線軌跡、周囲光球、着弾、命中演出とpool／instanceの生成数、更新、破棄を計測する。
- G／N／H、F／E／C、Follow／Leave、同期射撃、Mission、Alarm、放送、ミニマップ、公開処刑、世界境界、扉、エレベーターを回帰する。
- `V2TitleSettings`、V1保存キー不変、V2 schema version不一致reset、version 1正規化、通常全reset、公開処刑部分reset、通常／即時公開処刑、R／Enter、静的学校資源identityを回帰する。
- 1920×1080、1280×720、1024×600、800×600、640×480、480×360と連続resizeを回帰し、全設定への到達、値・focus・mode維持、横overflow 0を確認する。

## 計測・最適化境界

- CPU、GPU、NavMesh、視線Ray、経路再計画、光線、光球、PointLight、Mission、ミニマップ、room variant、heapを分離計測する。
- 安全判定、経路意味、設定初期値、表示項目、ゲームルールを変える最適化は行わない。
- 学校資産を変更する必要が判明した場合はT07へ混在させず、P2の問題別branchへ戻す。

## ステップ

- [ ] 全個別計画の結果とP2必須修正0件を確認する
- [ ] 既定通常構成の開始直後10秒・定常戦闘60秒をWeb／Electronで計測する
- [ ] 最大構成を同一seedで120秒実行し、診断・保持・baseline比を測定する
- [ ] CPU／GPU／AI／NavMesh／演出／UI／heapを分離して意味不変の最適化を行う
- [ ] BIT安全、扉、エレベーター、Follower、Mission、Alarm、放送、終了導線を回帰する
- [ ] `V2TitleSettings`、V1保存分離、6 viewport、連続resize、静的資源再利用を回帰する
- [ ] Web版とElectron版をbuildし、console warning・error 0件を確認する
- [ ] ゲーム仕様、技術仕様、3D実行仕様、Blender資産仕様を同期する
- [ ] V4性能・リリースゲートと独立レビューを完了する
- [ ] 結果を更新し、T07差分だけをcommitする

## 結果

未着手。T06-6D統合とP2必須修正0件の後に開始する。既定通常構成の60fps目標と、リアルタイム鏡面反射なしの99 NPC／50 BIT・120秒安定性stressを別々に判定する。
