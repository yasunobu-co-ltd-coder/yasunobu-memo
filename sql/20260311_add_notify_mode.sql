-- ============================================================
-- 用途: push_subscriptions に通知モード (all/mine) カラムを追加
-- 日時: 2026-03-11
-- 対象: yasunobu-memo
-- 説明: ユーザーごとに「すべての案件」or「自分の案件のみ」の
--       通知フィルタリングを可能にする
-- ============================================================

ALTER TABLE push_subscriptions
ADD COLUMN IF NOT EXISTS notify_mode text NOT NULL DEFAULT 'all';

COMMENT ON COLUMN push_subscriptions.notify_mode IS
  'all = すべての案件を通知, mine = 自分が依頼人or担当者の案件のみ通知';
