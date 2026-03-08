import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
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

    // 2) 作成者・担当者の名前を一括取得
    const userIds = [...new Set([created_by, deal.assignee])];
    const { data: userRows } = await supabaseAdmin
      .from('users').select('id, name').in('id', userIds);

    const userMap = new Map((userRows ?? []).map((u: { id: string; name: string }) => [u.id, u.name]));
    const createdName = userMap.get(created_by) ?? '誰か';
    const createdUser = userMap.has(created_by) ? { name: userMap.get(created_by)! } : null;
    const assigneeUserRow = userMap.has(deal.assignee) ? { name: userMap.get(deal.assignee)! } : null;

    const dealWithNames = {
      ...deal,
      created_user: createdUser ? { name: createdUser.name } : null,
      assignee_user: assigneeUserRow ? { name: assigneeUserRow.name } : null,
    };

    // 3) Push通知（after() でレスポンス返却後にサーバーレス関数内で実行）
    const title = `${createdName}がメモ追加`;
    const notifBody = client_name
      ? `${client_name}: ${memo}`.slice(0, 180)
      : memo.slice(0, 180);

    after(async () => {
      const t0 = Date.now();
      try {
        const result = await sendPushToAll(
          { title, body: notifBody, url: '/', memo_id: deal.id },
          created_by,
          deal.id,
        );
        console.log(
          `[push] done in ${Date.now() - t0}ms — sent=${result.sent_to_count} ok=${result.success_count} fail=${result.failure_count}`,
        );
      } catch (err) {
        console.error(`[push] failed after ${Date.now() - t0}ms:`, err);
      }
    });

    return NextResponse.json({ deal: dealWithNames });
  } catch (e) {
    console.error('[yasunobu-memo/create] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
