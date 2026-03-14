import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabaseAdmin } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';

// VAPID 設定
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ---------------------------------------------------------------------------
// GET /api/cron/deadline-reminders
// 毎朝 9:00 JST に Vercel Cron から呼ばれる
// 1) 明日が期限の案件 → 担当者に「明日が期限です」通知
// 2) 昨日が期限で未完了 → 担当者に「期限が過ぎています」通知
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  // Vercel Cron の認証チェック
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // JST で今日・明日・昨日を計算
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = formatDate(jst);
  const tomorrow = formatDate(new Date(jst.getTime() + 24 * 60 * 60 * 1000));
  const yesterday = formatDate(new Date(jst.getTime() - 24 * 60 * 60 * 1000));

  console.log(`[cron] deadline-reminders: today=${today}, tomorrow=${tomorrow}, yesterday=${yesterday}`);

  const results = { tomorrow_count: 0, overdue_count: 0, sent: 0, errors: 0 };

  try {
    // 1) 明日が期限の案件を取得
    const { data: tomorrowDeals } = await supabaseAdmin
      .from('yasunobu-memo')
      .select('id, client_name, memo, due_date, assignee, assignee_user:users!assignee(name)')
      .eq('status', 'open')
      .eq('due_date', tomorrow);

    if (tomorrowDeals && tomorrowDeals.length > 0) {
      results.tomorrow_count = tomorrowDeals.length;
      for (const deal of tomorrowDeals) {
        const title = '明日が期限です';
        const body = `${deal.client_name || '(相手不明)'}: ${(deal.memo || '').slice(0, 100)}`;
        const r = await sendPushToUser(deal.assignee, { title, body, url: '/' });
        results.sent += r.sent;
        results.errors += r.errors;
      }
    }

    // 2) 昨日が期限で未完了の案件を取得
    const { data: overdueDeals } = await supabaseAdmin
      .from('yasunobu-memo')
      .select('id, client_name, memo, due_date, assignee, assignee_user:users!assignee(name)')
      .eq('status', 'open')
      .eq('due_date', yesterday);

    if (overdueDeals && overdueDeals.length > 0) {
      results.overdue_count = overdueDeals.length;
      for (const deal of overdueDeals) {
        const title = '期限切れの案件があります';
        const body = `${deal.client_name || '(相手不明)'}: ${(deal.memo || '').slice(0, 100)}`;
        const r = await sendPushToUser(deal.assignee, { title, body, url: '/' });
        results.sent += r.sent;
        results.errors += r.errors;
      }
    }

    console.log(`[cron] deadline-reminders done:`, results);
    return NextResponse.json({ ok: true, ...results });
  } catch (e) {
    console.error('[cron] deadline-reminders exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// 特定ユーザーの有効な購読に Push 送信
// ---------------------------------------------------------------------------
async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string },
): Promise<{ sent: number; errors: number }> {
  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('enabled', true);

  if (!subs || subs.length === 0) return { sent: 0, errors: 0 };

  let sent = 0;
  let errors = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      sent++;
    } catch (err: unknown) {
      const e = err as { statusCode?: number };
      if (e.statusCode === 410 || e.statusCode === 404) {
        await supabaseAdmin
          .from('push_subscriptions')
          .update({ enabled: false })
          .eq('id', sub.id);
      }
      errors++;
    }
  }

  return { sent, errors };
}

// ---------------------------------------------------------------------------
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
