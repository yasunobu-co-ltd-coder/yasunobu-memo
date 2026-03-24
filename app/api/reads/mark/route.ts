import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { memo_id, user_id } = await req.json();
    if (!memo_id || !user_id) return NextResponse.json({ error: 'memo_id and user_id are required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('yasunobu-memo-reads')
      .upsert({ memo_id, user_id }, { onConflict: 'memo_id,user_id' });

    if (error) {
      console.error('[reads/mark] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[reads/mark] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
