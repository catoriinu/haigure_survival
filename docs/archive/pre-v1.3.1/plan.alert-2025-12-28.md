# alert送信/受信の分離実装計画

更新日: 2025-12-28

## 目的
- Bitのalert送信/受信を明示的なモードに分離する
- NPCのalert送信/受信を明示的なstateに分離する
- 非Aliveターゲット時は送信/受信を解除し、元の行動へ戻す

## 分離方針
- Bit: `BitMode`に`alert-send`/`alert-receive`を追加し、既存`alert`を`alert-receive`へ置換。ビット起点のalertは送信者=leaderが`alert-send`、受信者は`alert-receive`。ブロッカー起点のalertはビット送信なし（受信者のみ`alert-receive`）。
- NPC: `Npc`に`alertState: "none" | "send" | "receive"`を追加し、stateとして分離。`receive`時は`brainwashMode`/`brainwashTargetId`を保存して追従を上書きし、解除時に元へ戻す。`send`はalertRequests発生時に付与。
- 復帰: Bitは`alertReturnMode`/`alertReturnTargetId`を保持、NPCは`alertReturnBrainwashMode`/`alertReturnTargetId`を保持し、ターゲット非Aliveで復帰。

## ステップ
- [x] 分離方針の確定: Bitモード（alert-send/alert-receive）とNPC state（alertState）の追加範囲と遷移条件を整理
- [x] updateBits/updateNpcsの分岐修正と既存効果音/演出の影響確認について、具体的な修正案を提示し承認を得る（承認後に実装へ進む）
- [x] types.tsの型追加・遷移処理の実装（モード/state切替、解除条件）
- [x] alert送信/受信の挙動差を反映（送信者は集合要求のみ、受信者は集合・攻撃遷移）
- [x] 既存挙動の確認（射撃停止、search復帰、alert SE/演出の発火条件）
