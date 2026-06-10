BEGIN;

WITH categories(name, sort_order) AS (
  VALUES
    ('各種システムのチェック', 0),
    ('顧客対応と事務作業', 1),
    ('決済確認', 2),
    ('LINEグループ管理', 3),
    ('アットイン清掃管理システム確認', 4),
    ('調整および書類作成', 5),
    ('大森TODO', 6)
),
inserted_categories AS (
  INSERT INTO task_categories (name, "sortOrder", "isActive")
  SELECT name, sort_order, true
  FROM categories
  WHERE NOT EXISTS (SELECT 1 FROM task_categories)
  RETURNING id, name
),
task_rows(category_name, label, default_planned, deadline, sort_order) AS (
  VALUES
    ('各種システムのチェック', 'メールのチェック（osouji.oimachi@gmail.com）（ご近所割のスプシ確認）', '当日事務担当', '', 0),
    ('各種システムのチェック', 'Storesの予約確認チェック', '当日事務担当', '', 1),
    ('顧客対応と事務作業', '電話対応（フリーダイヤル）および顧客対応（LINE・来店・メールなど）', '当日事務担当', '', 0),
    ('顧客対応と事務作業', '案件完了ごとの売上表更新・POSおよびラクーンの完了処理', '当日事務担当', '', 1),
    ('顧客対応と事務作業', '公式LINEからの前日リマインド送信', '当日事務担当', '', 2),
    ('顧客対応と事務作業', '公式LINEからのアフターフォローの実施', '当日事務担当', '', 3),
    ('決済確認', 'SquareとPayPayの決済額とカレンダー内容が一致しているかの照合', '当日事務担当', '', 0),
    ('LINEグループ管理', '事務グループ（4グループのいずれか）への日付メッセージ投稿', '当日事務担当', '', 0),
    ('LINEグループ管理', '翌日の稼働グループの作成', '当日事務担当', '', 1),
    ('LINEグループ管理', '翌日のスケジュールと配車を確定させて配信する', '当日現場責任者', '17:00まで', 2),
    ('アットイン清掃管理システム確認', '翌日入居で清掃が漏れていないかの確認', '当日現場責任者', '12:00まで', 0),
    ('アットイン清掃管理システム確認', '赤くなっている清掃カードの消し込み作業（4/15まで確認する。4/15まではカレンダーへ入力、4/16以降は消し込みだけでOK）', '当日事務担当', '', 1),
    ('調整および書類作成', 'STORESの空き枠のシフト調整（10日先まで確認すること）', '当日事務担当', '', 0),
    ('調整および書類作成', '翌日の見積もり作成および印刷', '当日事務担当', '', 1),
    ('大森TODO', '前日の売上日報の確認', '当日現場責任者', '', 0),
    ('大森TODO', '前日のインセンティブ報告の内容確認', '当日現場責任者', '', 1),
    ('大森TODO', '1週間先までのグレーセルの確認', '当日現場責任者', '', 2),
    ('大森TODO', '現金確認', '当日現場責任者', '', 3),
    ('大森TODO', 'アットインスラックの返信もれ確認', '当日現場責任者', '17:00まで', 4),
    ('大森TODO', 'タイミー手配・修正依頼確認', '当日現場責任者', '', 5),
    ('大森TODO', 'アットイン・富士通の鍵確認（曜日トレーに入れる）', '当日現場責任者', '', 6),
    ('大森TODO', 'アットイン管理表と完了分の付け合わせ', '当日現場責任者', '', 7)
)
INSERT INTO task_definitions ("categoryId", label, "defaultPlanned", deadline, "sortOrder", "isActive")
SELECT inserted_categories.id, task_rows.label, task_rows.default_planned, task_rows.deadline, task_rows.sort_order, true
FROM task_rows
JOIN inserted_categories ON inserted_categories.name = task_rows.category_name;

COMMIT;
