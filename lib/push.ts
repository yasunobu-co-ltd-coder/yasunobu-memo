import webpush from 'web-push';
import { supabaseAdmin } from './supabase-server';

// ---------------------------------------------------------------------------
// VAPID 初期設定
// ---------------------------------------------------------------------------
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------
export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  memo_id?: string;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface SendError {
  endpoint: string;
  statusCode?: number;
  message: string;
}

interface SendResult {
  sent_to_count: number;
  success_count: number;
  failure_count: number;
}

const CONCURRENCY = 15;

// ---------------------------------------------------------------------------
// 全有効購読へ Push 送信 → notification_log 保存
// ---------------------------------------------------------------------------
export async function sendPushToAll(
  payload: PushPayload,
  triggeredByUserId: string,
  memoId: string,
): Promise<SendResult> {
  const { data: rows, error: fetchErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('enabled', true);

  if (fetchErr) {
    console.error('[push] fetch subscriptions failed:', fetchErr.message);
    await insertLog(memoId, triggeredByUserId, 0, 0, 0, [
      { endpoint: '-', message: `fetch error: ${fetchErr.message}` },
    ]);
    return { sent_to_count: 0, success_count: 0, failure_count: 0 };
  }

  const subs = (rows ?? []) as SubscriptionRow[];
  if (subs.length === 0) {
    await insertLog(memoId, triggeredByUserId, 0, 0, 0, []);
    return { sent_to_count: 0, success_count: 0, failure_count: 0 };
  }

  const results = await runWithConcurrency(
    subs,
    (sub) => sendOne(sub, payload),
    CONCURRENCY,
  );

  const errors: SendError[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const r of results) {
    if (r.status === 'fulfilled') {
      successCount++;
    } else {
      failureCount++;
      errors.push(r.reason as SendError);
    }
  }

  await insertLog(memoId, triggeredByUserId, subs.length, successCount, failureCount, errors);

  return {
    sent_to_count: subs.length,
    success_count: successCount,
    failure_count: failureCount,
  };
}

// ---------------------------------------------------------------------------
// 並列数制限ワーカープール
// ---------------------------------------------------------------------------
async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  limit: number,
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = new Array(items.length);
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        await worker(items[idx]);
        results[idx] = { status: 'fulfilled', value: undefined };
      } catch (err) {
        results[idx] = { status: 'rejected', reason: err };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

// ---------------------------------------------------------------------------
// 1 件送信
// ---------------------------------------------------------------------------
async function sendOne(sub: SubscriptionRow, payload: PushPayload): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 3600 },
    );
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };

    if (e.statusCode === 410 || e.statusCode === 404) {
      await supabaseAdmin
        .from('push_subscriptions')
        .update({ enabled: false })
        .eq('id', sub.id);
      console.log(`[push] disabled expired: ${sub.endpoint.slice(0, 60)}…`);
    }

    throw {
      endpoint: sub.endpoint.slice(0, 120),
      statusCode: e.statusCode,
      message: e.message ?? 'Unknown error',
    } satisfies SendError;
  }
}

// ---------------------------------------------------------------------------
// notification_log へ INSERT
// ---------------------------------------------------------------------------
async function insertLog(
  memoId: string,
  triggeredByUserId: string,
  sentToCount: number,
  successCount: number,
  failureCount: number,
  errors: SendError[],
): Promise<void> {
  const { error } = await supabaseAdmin.from('notification_log').insert({
    memo_id: memoId,
    triggered_by_user_id: triggeredByUserId,
    sent_to_count: sentToCount,
    success_count: successCount,
    failure_count: failureCount,
    errors,
  });
  if (error) {
    console.error('[push] insertLog failed:', error.message);
  }
}
