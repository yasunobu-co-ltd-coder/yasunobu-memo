import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';

/**
 * GET /api/push/subscribe?endpoint=...
 * 購読状態を確認（user_id を上書きしない）
 */
export async function GET(req: NextRequest) {
  try {
    const endpoint = req.nextUrl.searchParams.get('endpoint');
    if (!endpoint) {
      return NextResponse.json({ exists: false });
    }

    const { data, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, user_id, notify_mode, enabled')
      .eq('endpoint', endpoint)
      .eq('enabled', true)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ exists: false });
    }

    // 登録済みユーザーの名前を取得
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('name')
      .eq('id', data.user_id)
      .single();

    return NextResponse.json({
      exists: true,
      notify_mode: data.notify_mode || 'all',
      subscriber_name: user?.name || '',
    });
  } catch (e) {
    console.error('[subscribe] GET exception:', e);
    return NextResponse.json({ exists: false });
  }
}

/**
 * POST /api/push/subscribe
 * Push購読を登録（upsert: endpoint重複時は更新 + enabled=true に戻す）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subscription, user_id } = body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth || !user_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        {
          user_id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          enabled: true,
          user_agent: req.headers.get('user-agent') || '',
        },
        { onConflict: 'endpoint' }
      )
      .select()
      .single();

    if (error) {
      console.error('[subscribe] upsert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id, notify_mode: data.notify_mode || 'all' });
  } catch (e) {
    console.error('[subscribe] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/push/subscribe
 * 通知モード更新 (notify_mode: 'all' | 'mine')
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { user_id, notify_mode } = body;

    if (!user_id || !['all', 'mine'].includes(notify_mode)) {
      return NextResponse.json({ error: 'user_id and valid notify_mode required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .update({ notify_mode })
      .eq('user_id', user_id)
      .eq('enabled', true);

    if (error) {
      console.error('[subscribe] patch error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, notify_mode });
  } catch (e) {
    console.error('[subscribe] patch exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/push/subscribe
 * Push購読を削除（endpoint または user_id で削除）
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint, user_id } = body;

    if (!endpoint && !user_id) {
      return NextResponse.json({ error: 'Missing endpoint or user_id' }, { status: 400 });
    }

    let query = supabaseAdmin.from('push_subscriptions').delete();
    if (endpoint) {
      query = query.eq('endpoint', endpoint);
    } else {
      query = query.eq('user_id', user_id);
    }

    const { error } = await query;

    if (error) {
      console.error('[unsubscribe] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[unsubscribe] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
