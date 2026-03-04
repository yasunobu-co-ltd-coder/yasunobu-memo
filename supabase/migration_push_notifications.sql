-- ============================================================
-- Web Push通知用テーブル（user参照版）
-- ============================================================

-- 1) push_subscriptions: 各ユーザーの各端末のPush購読情報
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,

  enabled BOOLEAN NOT NULL DEFAULT true,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON push_subscriptions(endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_enabled
  ON push_subscriptions(user_id, enabled);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_enabled
  ON push_subscriptions(enabled)
  WHERE enabled = true;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION set_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON push_subscriptions;

CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_push_subscriptions_updated_at();


-- 2) notification_log: 通知送信ログ
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  memo_id UUID NOT NULL REFERENCES "yasunobu-memo"(id) ON DELETE CASCADE,

  triggered_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  sent_to_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_memo_id
  ON notification_log(memo_id);

CREATE INDEX IF NOT EXISTS idx_notification_log_created_at
  ON notification_log(created_at DESC);


-- ============================================================
-- RLS（試験運用：全開放）
-- ============================================================
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access" ON push_subscriptions
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access" ON notification_log
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
