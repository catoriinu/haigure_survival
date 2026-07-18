# アラート解除とターゲット生存判定の修正計画

更新日: 2025-12-28

## 目的
- 非Aliveターゲットに対する追従/射撃を停止してsearchへ戻す
- alert受信時もターゲット死亡で中断し元のモードへ戻す

## ステップ
- [x] NPCのbrainwash追尾で非Aliveターゲットを即searchへ戻すよう復元
- [x] Bitのalert/追尾ターゲット選定をaliveのみへ戻し、外部alert適用時のalive確認と解除条件を整理
- [x] 関連箇所の挙動確認（alert解除、射撃停止、targetedIds更新）
