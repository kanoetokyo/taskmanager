# タスク管理アプリ TODO

## フルスタック版アップグレード

- [x] web-db-user機能追加（DB・サーバー・ユーザー認証）
- [x] データベーススキーマ設計（taskStates, storeChecks, handoverMemos, individualHandovers, customerHandovers, misocaStatus）
- [x] pnpm db:push でマイグレーション実行
- [x] バックエンドAPIルーター実装（taskRouter.ts）
  - [x] taskStates.getByDate / upsert / bulkUpsert
  - [x] storeCheck.getByDate / upsert
  - [x] handover.getByDate / upsert / delete
  - [x] individualHandover.getActive / upsert / delete
  - [x] customerHandover.getActive / upsert / delete
  - [x] misoca.get / upsert
- [x] フロントエンドをlocalStorageからtRPC APIに移行（Home.tsx）
  - [x] タスク状態のDB同期
  - [x] 店舗チェックのDB同期
  - [x] 全体引き継ぎのDB同期
  - [x] 個別引き継ぎのDB同期
  - [x] 顧客引き継ぎのDB同期
  - [x] MISOCAステータスのDB同期
  - [x] 手動同期ボタン追加（RefreshCwアイコン）
  - [x] 30秒ポーリングによるリアルタイム同期
- [x] ユニットテスト作成・全テスト通過（21件）
