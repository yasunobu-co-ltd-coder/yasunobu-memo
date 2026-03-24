import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('yasunobu-memo-unread')
      .upsert({ user_id, last_checked_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) {
      console.error('[unread/update] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[unread/update] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
