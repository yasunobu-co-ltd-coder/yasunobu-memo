import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest) {
  try {
    const { id, sort_order } = await req.json();
    if (!id || sort_order === undefined) return NextResponse.json({ error: 'id and sort_order are required' }, { status: 400 });

    const { error } = await supabaseAdmin.from('users').update({ sort_order }).eq('id', id);
    if (error) {
      console.error('[users/update-order] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[users/update-order] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
