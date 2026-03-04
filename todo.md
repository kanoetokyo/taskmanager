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

## 全体引き継ぎ機能拡張

- [x] DBスキーマにnoConfirmationRequired（確認不要フラグ）を追加・マイグレーション
- [x] バックエンドAPIのupsertに確認不要フラグを追加
- [x] フロントエンドUI：確認不要トグルボタンを追加
- [x] フロントエンドUI：確認不要の場合は確認チェック欄を非表示にする
- [x] フロントエンドUI：削除ボタンを追加（常時表示）

## 自動保存バグ修正

- [x] useCallbackの依存配列を修正（useRefでmutationの最新参照を保持するstale closure対策）

## 同期バグ調査・修正

- [x] MISOCAと他セクションの実装の違いを調査して原因を特定
- [x] 同期が機能しない全セクションを修正（stale closure：setXxx(prev =>)内でのsave呼び出しをsetter外に移動）

## 保存失敗時のエラー通知

- [x] 各save関数（タスク・店舗チェック・全体引き継ぎ・個別引き継ぎ・顧客引き継ぎ）のcatchブロックにトースト通知を追加

## 同期問題の根本調査・修正（再発）

- [x] DBへの書き込みが実際に行われているかSQLで確認
- [x] taskRouter.tsのbulkUpsertの実装を確認（onDuplicateKeyUpdateが正しく動作しているか）
- [x] フロントエンドのuseQueryのrefetch/pollingが正しく動作しているか確認
- [x] 原因を特定して修正：dateKey varchar(8)→varchar(10)にマイグレーション（YYYY-MM-DD形式は10文字）

## 自動保存・同期最終修正

- [x] drizzle/schema.tsのdateKey varchar(8)をvarchar(10)に変更（全5テーブル）
- [x] pnpm db:push でマイグレーション実行（0005_robust_arclight.sql）
- [x] 全26テスト通過確認

## HELPフラグ同期バグ修正

- [x] スキーマ・ルーター・フロントエンドでHELPフラグが保存されない原因を調査
- [x] task_statesテーブルにhelpカラム追加（drizzle/schema.ts）
- [x] バックエンドAPIのupsert・bulkUpsertにhelpフラグを追加（taskRouter.ts）
- [x] フロントエンドのDB読み込み時にhelpフラグを反映（dbState?.help）
- [x] フロントエンドのbulkUpsert送信にhelpフラグを追加（Home.tsx）
- [x] pnpm db:push でマイグレーション実行（0006_gigantic_reavers.sql）
- [x] helpフラグのテスト5件追加・全31テスト通過確認

## 自動更新間隔変更

- [x] Home.tsxの全useQueryのrefetchInterval を30000ms→10000msに変更

## MISOCAセクションUI変更

- [x] MISOCAセクションを1行に収まるようコンパクト化

## グレーセル確認セクション追加

- [x] drizzle/schema.tsにgray_cell_statusテーブルを追加
- [x] pnpm db:pushでマイグレーション実行（0007_amazing_betty_brant.sql）
- [x] server/taskRouter.tsにgrayCellルーターを追加（get / upsert）
- [x] Home.tsxにuseQuery・useMutation・UI（MISOCAと同じ１行レイアウト）を追加
- [x] テスト５件追加・全36テスト通過確認

## 入力中にデータが消えるバグ修正

- [x] 全体・個別・顧客引き継ぎのuseEffectで入力中にDBデータで上書きされる原因を特定
- [x] isEditingHandoverRef/isEditingIndividualRef/isEditingCustomerRefを追加
- [x] textarea/inputのonFocusでtrue、onBlurでfalseにセット
- [x] useEffect([handoverData/individualHandoverData/customerData])で入力中はスキップ
- [x] 全36テスト通過確認

## バグ修正・UI改善 (2026-03-04)

- [x] バグ修正: TODOの完了チェックが10秒ポーリングで復活する問題（tasksLoadedRefのレースコンディション）
- [x] バグ修正: 全体引き継ぎのメモ入力欄が勝手に増える問題（handoverData空時の初期化ロジック）
- [x] UI改善: 引き継ぎ3セクションの削除ボタンをTrash2アイコンに変更・確認ダイアログを削除

## 機能追加 (2026-03-04 追加依頼)
- [ ] タスク7番（SquareとPayPay照合）の下に備考欄を追加（DB保存・マルチデバイス同期）
- [ ] タスク18番（現金確認）の下に備考欄を追加（DB保存・マルチデバイス同期）
