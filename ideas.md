# タスク管理アプリ デザインアイデア

## ユーザー要件
- シンプルでわかりやすいラフなサイト
- 各タスクに作業予定者・実施者のプルダウン
- 担当者リスト：前田、加藤、泉、新井なお、新井さやか、田邊まい、その他

---

<response>
<idea>
**Design Movement**: Functional Minimalism（機能的ミニマリズム）

**Core Principles**:
- 情報密度を高く保ちながら視覚的ノイズを最小化
- テーブルベースの明快なレイアウト
- 白背景に黒テキスト、アクセントカラーは1色のみ
- 余白を積極的に使い、各セクションを明確に区切る

**Color Philosophy**: 白 (#FFFFFF) + ダークグレー (#1a1a1a) + アクセントにインディゴ (#4F46E5)。業務ツールとして集中できる落ち着いた配色。

**Layout Paradigm**: 縦スクロール型リスト。カテゴリごとにセクション分け。左端にカテゴリラベル、右側にタスク行。

**Signature Elements**:
- 細い水平線でタスクを区切る
- カテゴリヘッダーに左ボーダーアクセント
- プルダウンはネイティブselect要素

**Interaction Philosophy**: クリックで即座に反応。保存ボタンで一括保存。

**Animation**: ほぼなし。プルダウン変更時に軽いフェード。

**Typography System**: システムフォント（-apple-system, sans-serif）。見出しはfont-weight: 700、本文は400。
</idea>
<probability>0.08</probability>
</response>

<response>
<idea>
**Design Movement**: Structured Utility（構造的ユーティリティ）

**Core Principles**:
- テーブル形式で全タスクを一覧表示
- カテゴリごとに背景色を薄く変えて視認性を確保
- ヘッダー固定でスクロール時も列名が見える
- 印刷対応レイアウト

**Color Philosophy**: ライトグレー (#F8F9FA) ベース。カテゴリごとに薄いカラーコーディング（青、緑、黄、橙など）。アクセントは #2563EB（ブルー）。

**Layout Paradigm**: フルワイドテーブル。列：カテゴリ、タスク名、作業予定者、実施者、ステータス。

**Signature Elements**:
- カテゴリ行を結合（rowspan）
- 交互行の背景色（ストライプ）
- ステータスバッジ

**Interaction Philosophy**: 行クリックでハイライト。変更は自動保存（localStorage）。

**Animation**: 行ホバー時に背景色変化。

**Typography System**: Noto Sans JP（Google Fonts）。見出し600、本文400。
</idea>
<probability>0.09</probability>
</response>

<response>
<idea>
**Design Movement**: Clean Dashboard（クリーンダッシュボード）

**Core Principles**:
- カード型UIでカテゴリを視覚的に分離
- 各カードにカテゴリタイトルとタスクリスト
- プルダウンはshadcn/ui Selectコンポーネント
- レスポンシブ対応（モバイルでも使いやすい）

**Color Philosophy**: 白背景 + ライトグレーカード。ヘッダーはスレートグレー (#334155)。プライマリカラーは #0EA5E9（スカイブルー）。

**Layout Paradigm**: 縦スクロール。カテゴリカードが縦に並ぶ。各カードの中にタスク行。

**Signature Elements**:
- カードに薄いシャドウ
- カテゴリアイコン（絵文字で代替可）
- 上部に日付と保存ボタン

**Interaction Philosophy**: プルダウン変更で即時反映。localStorageで状態保持。

**Animation**: カードのホバーで軽い浮き上がり。

**Typography System**: Noto Sans JP。カテゴリタイトルはfont-semibold text-lg。
</idea>
<probability>0.07</probability>
</response>

---

## 選択: Structured Utility（構造的ユーティリティ）

業務ツールとして最も実用的。テーブル形式で全タスクを一覧できるため、作業予定者・実施者の確認が素早くできる。
