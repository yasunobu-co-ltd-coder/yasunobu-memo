-- 既読管理テーブル（yasunobu-memo）
-- 各ユーザーがどのメモを既読したかを記録する
CREATE TABLE IF NOT EXISTS "yasunobu-memo-reads" (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  memo_id uuid NOT NULL REFERENCES "yasunobu-memo"(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(memo_id, user_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_yasunobu_memo_reads_memo ON "yasunobu-memo-reads"(memo_id);
CREATE INDEX IF NOT EXISTS idx_yasunobu_memo_reads_user ON "yasunobu-memo-reads"(user_id);

-- RLS
ALTER TABLE "yasunobu-memo-reads" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON "yasunobu-memo-reads" FOR ALL USING (true) WITH CHECK (true);
