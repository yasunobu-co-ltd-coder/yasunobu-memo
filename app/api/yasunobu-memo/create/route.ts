import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { sendPushToAll } from '../../../../lib/push';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// POST /api/yasunobu-memo/create
// yasunobu-memo INSERT → 全有効購読へ Web Push → notification_log 保存
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      created_by,
      client_name,
      memo,
      due_date,
      importance,
      profit,
      urgency,
      assignment_type,
      assignee,
      status,
    } = body;

    if (!created_by || !memo) {
      return NextResponse.json(
        { error: 'created_by (UUID) and memo are required' },
        { status: 400 },
      );
    }

    // 1) yasunobu-memo INSERT
    const { data: deal, error: insertErr } = await supabaseAdmin
      .from('yasunobu-memo')
      .insert([{
        created_by,
        client_name: client_name || '',
        memo,
        due_date: due_date || null,
        importance: importance || '中',
        profit: profit || '中',
        urgency: urgency || '中',
        assignment_type: assignment_type || '自分で',
        assignee: assignee || created_by,
        status: status || 'open',
      }])
      .select('*')
      .single();

    if (insertErr) {
      console.error('[yasunobu-memo/create] insert error:', insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // 2) 作成者・担当者の名前を取得
    const { data: createdUser } = await supabaseAdmin
      .from('users').select('name').eq('id', created_by).single();
    const { data: assigneeUserRow } = await supabaseAdmin
      .from('users').select('name').eq('id', deal.assignee).single();

    const createdName = createdUser?.name ?? '誰か';

    const dealWithNames = {
      ...deal,
      created_user: createdUser ? { name: createdUser.name } : null,
      assignee_user: assigneeUserRow ? { name: assigneeUserRow.name } : null,
    };

    // 3) Push通知
    const title = `${createdName}がメモ追加`;
    const notifBody = client_name
      ? `${client_name}: ${memo}`.slice(0, 180)
      : memo.slice(0, 180);

    try {
      await sendPushToAll(
        { title, body: notifBody, url: '/', memo_id: deal.id },
        created_by,
        deal.id,
      );
    } catch (err) {
      console.error('[yasunobu-memo/create] push error:', err);
    }

    return NextResponse.json({ deal: dealWithNames });
  } catch (e) {
    console.error('[yasunobu-memo/create] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
