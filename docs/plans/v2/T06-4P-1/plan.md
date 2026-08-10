# HAIGURE SURVIVAL v2 T06-4P-1 ミニマップ・BIT表示 計画

更新日: 2026-08-10

## プロンプト

> ミニマップは作者定義された階別仕切りだけを黒で描き、扉・出入口は壁の切れ目と短い明色線で示す。
>
> BIT先端球は通常時を黒へ戻す。デバッグ表示は既定OFFとし、V1色をchase=緑、fixed=水色、random=黄、alert-send=橙、alert-receive=青、carpet-leader=桃、hold=白へ復元し、V2固有のcarpet-followerは紫にする。

## 目的

B06-4の作者定義`floor_map`／`map_barrier`／`map_passage`をそのまま描画し、家具投影と別階混入を廃止する。同時にBIT先端球の通常色と既定OFFのモード別デバッグ色を確定する。

## 開始条件

- B06-4が独立レビュー後に`develop`へ統合済みである。
- 5階層の`StageMinimapBarrier`／`StageMinimapPassage`がLocation registryから取得できる。
- `codex/v2-minimap-bit-polish`の専用worktreeを使用する。

## 公開Runtime契約

```ts
export type StageMinimapBarrier = Readonly<{
  id: string;
  floorId: StageLocationFloorId;
  mesh: Mesh;
}>;

export type StageMinimapPassage = Readonly<{
  id: string;
  floorId: StageLocationFloorId;
  mesh: Mesh;
}>;
```

- `StageLocationAssetRegistry`へ`minimapBarriers`、`minimapPassages`と、階別取得APIを追加する。
- `src/ui/v2Minimap.ts`は作者定義barrierだけを黒で描き、passageは壁の切れ目に重なる短い明色線として描く。
- 旧`structuralBlockers`投影、Nav blocker、Collider、Object名・座標からの仕切り推測は削除し、fallbackを設けない。
- `V2BitSystemConfig`へ既定`false`のモード別先端球デバッグ表示を追加する。設定OFF時は全モード黒、ON時だけ確定色を使う。

## BIT色契約

| 状態 | 色 |
|---|---|
| 通常表示（デバッグOFF） | 黒 |
| chase | 緑 |
| fixed | 水色 |
| random | 黄 |
| alert-send | 橙 |
| alert-receive | 青 |
| carpet-leader | 桃 |
| hold | 白 |
| carpet-follower | 紫 |

## Location・Mission受入

- 中央校庭・体育館北側通路は`1F 校庭`、東西南北外周は`1F 校舎外周`と表示する。
- 校舎外周をPlayer／NPC Mission候補やミニマップLocation目標へ追加しない。
- `gym-rooftop`をPlayer／NPC通常Mission候補として読み、HUDに`3F 体育館屋上へ行く`を表示し、active時だけミニマップ目標を出す。
- Location IDや座標をRuntimeへ直書きしない。

## 受入条件

- 1F～4F・屋上で家具表示0件、別階混入0件、恒久仕切りだけが黒、全通行開口が短い明色線である。
- 屋上は屋上床輪郭、プール、更衣室、階段室、屋上固有壁・柵だけを表示する。
- BIT先端球はデバッグOFFで全モード黒、ONで上表8色と一致する。
- デバッグ表示は既定OFFで、通常ゲームの保存設定やタイトル設定へ先行追加しない。
- 1F Area表示と3F体育館屋上MissionがB06-4の意味資産だけで成立する。

## 検証

- T06-3 fixtureへ全階barrier／passage、家具0、別階混入0、cache再生成・破棄を追加する。
- T05 fixtureへ通常黒と全デバッグ色のMaterial回帰を追加する。
- T06-4 fixtureへArea表示、Mission候補、gym-rooftop完了・目標解除を追加する。
- 1920×1080の通常Web／Electronで全5階、BIT全モード、Pointer Lock、HUD重なり、console警告・エラー0件を確認する。

## ステップ

- [ ] B06-4 registryと現行structural blocker投影を監査する
- [ ] 失敗fixtureを先に追加する
- [ ] barrier／passageの階別描画へ切り替える
- [ ] BIT通常黒と既定OFFのモード別デバッグ色を実装する
- [ ] T05、T06-3、T06-4、build、Web／Electronを検証する
- [ ] 結果を更新してT06-4P-1差分だけをcommitする

## 結果

未着手。B06-4の`develop`統合後に開始する。
