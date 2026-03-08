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

## UI変更依頼 (2026-03-04)
- [x] 各カテゴリのTASKS表示を削除する
- [x] 公式LINE・POS・ラクーンで全店舗完了したら自動削除する
- [x] TODOの通し番号をシンプルなデザインに変更する（背景削除）
- [x] 「大森事務でのTODO」を「大森TODO」に変更する
- [x] 大森TODOに「アットインスラックの返信もれ確認(17:00まで)」を追加する
- [x] 「STORESの空き枠のシフト調整」に「(10日先まで確認すること)」を追加する
- [x] 「赤くなっている清掃カードの消し込み作業」に補足テキストを追加する

## 顧客引き継ぎ添付ファイル機能 (2026-03-06)
- [ ] customer_handover_attachments テーブルをDBスキーマに追加する
- [ ] storageDelete ヘルパーを server/storage.ts に追加する
- [ ] 添付ファイルのアップロード・取得・削除 API を追加する
- [ ] 顧客引き継ぎ削除時に添付ファイルもS3から自動削除する
- [ ] フロントエンドに添付ファイルUI（アップロード・プレビュー・削除）を追加する

## 顧客引き継ぎURLリンク機能 (2026-03-06)
- [x] customerHandoversテーブルのlinks（JSON配列）カラムを追加する
- [x] APIのupsertのlinksを追加する
- [x] フロントエンドにURLリンク入力欄（最大4件）を追加する
- [x] pnpm db:push でマイグレーション実行する

## 顧客引き継ぎ改善 (2026-03-06)
- [x] ステータスが「完了」になったら自動削除する
- [x] フィルタリングボタン（すべて/不通・未対応/調整中・仮予約中/保留）を追加する
- [x] ソートボタン（追加順/ステータス順）を追加する

## バグ修正: 前日未完了タスク表示 (2026-03-07)
- [x] 前日の未完了タスクが毎回19件表示されるバグを調査する
- [x] 前日の完了チェック状態が翌日以降に継続しない問題を修正する

## 大森TODO項目追加 (2026-03-07)
- [x] タイミー手配・修正依頼確認（当日現場責任者デフォルト）を追加する
- [x] アットイン・富士通の鍵確認(曜日トレーに入れる)（当日現場責任者デフォルト）を追加する
- [x] アットイン管理表と完了分の付け合わせ（当日現場責任者デフォルト）を追加する

## PC3列レイアウト変更 (2026-03-07)
- [x] PC画面で左（引き継ぎ系）・中（タスク一覧）・右（大森TODO）の3列レイアウトに変更する
- [x] スマホ画面は現状維持（縦１列）

## バグ修正: 各種システムチェックのLINE・ポス・ラクーン非表示 (2026-03-07)
- [x] 各種システムのチェックセクションでLINE・ポス・ラクーン項目が表示されない原因を調査する
- [x] 表示を修復する

## タスク定義のDB管理・編集モード実装 (2026-03-08)
- [x] DBスキーマにtask_categoriesとtask_definitionsテーブルを追加する
- [x] pnpm db:pushでマイグレーションを実行する
- [x] 現在のBASE_TASKSをDBに初期データとして投入する
- [x] tRPCルーターにタスク定義のCRUD手続きを追加する
- [x] 通常モードをDB参照に切り替える（BASE_TASKS配列を廃止）
- [x] 編集モードUI（追加・インライン編集・削除・並び替え）を実装する

## 大森TODOセクション編集モード対応 (2026-03-08)
- [x] 右列の大森TODOセクションにも編集モードUI（タスク追加・編集・削除）を追加する

## タスク編集ボタン移動・フィルターセクション再配置 (2026-03-08)
- [x] ヘッダーから「タスク編集」ボタンを削除する
- [x] 中列の「完了済みを隠す」フッターパネルに「タスク編集」ボタンを追加する
- [x] そのフッターパネルを右列の大森TODOの下に移動する

## バグ修正: keyプロップ警告 (2026-03-08)
- [x] Home.tsxのリストレンダリングでkeyプロップが欠けている箇所を特定して修正する

## カテゴリ管理機能 (2026-03-08)
- [x] DBスキーマにcategoriesテーブルを追加する
- [x] pnpm db:pushでマイグレーションを実行する
- [x] tRPCルーターにカテゴリCRUD・並び替えAPIを実装する
- [x] フロントエンドにカテゴリ管理UI（追加・削除・ドラッグ並び替え）を実装する
- [x] タスク編集モードでカテゴリ管理パネルを表示する
- [x] カテゴリ削除時にそのカテゴリのタスクも削除する確認ダイアログを表示する

## タスク編集モード強化：既存タスクの編集・削除・並び替え (2026-03-08)
- [x] サーバーAPIにタスク定義の並び替えAPI（reorderTaskDefinitions）を追加する
- [x] サーバーAPIにタスク定義の更新API（updateTaskDefinition）を追加する
- [x] サーバーAPIにタスク定義の削除API（deleteTaskDefinition）を追加する
- [x] フロントエンドのタスク編集モードで各タスク行にドラッグハンドルを追加する
- [x] フロントエンドのタスク編集モードで各タスク行にインライン編集（名前・担当者・期限）を追加する
- [x] フロントエンドのタスク編集モードで各タスク行に削除ボタンを追加する
- [x] カテゴリ内のタスク並び替えをDBに保存する

## 顧客引き継ぎステータス追加 (2026-03-08)
- [x] 顧客引き継ぎのステータスに「これから」を追加する（定義・スタイル・フィルター・ソート順・背景色）
