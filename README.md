# yasunobu - 案件管理アプリ

社内共有用の案件管理PWAアプリです。

## 機能

- 🔐 4桁PINコード認証
- 📋 案件の登録・一覧表示・完了管理
- 👥 担当者割り当て
- 🏷️ 重要度・急ぎ度・利益度による分類
- 📱 PWA対応（ホーム画面に追加可能）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

プロジェクトルートに `.env.local` ファイルを作成：

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Supabaseテーブル作成

Supabase SQL Editorで実行：

```sql
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL,
  client_name TEXT,
  memo TEXT,
  due_date DATE,
  importance TEXT,
  profit TEXT,
  urgency TEXT,
  assignment_type TEXT,
  assignee TEXT,
  status TEXT DEFAULT 'open'
);

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON deals FOR ALL USING (true) WITH CHECK (true);
```

### 4. 開発サーバー起動

```bash
npm run dev
```

## Vercelデプロイ

1. GitHubにプッシュ
2. [Vercel](https://vercel.com)でインポート
3. 環境変数を設定：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. デプロイ

## 技術スタック

- Next.js 16
- React 19
- Supabase
- TypeScript
- PWA
