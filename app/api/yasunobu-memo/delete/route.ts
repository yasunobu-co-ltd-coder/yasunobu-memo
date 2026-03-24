import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await supabaseAdmin.from('yasunobu-memo').delete().eq('id', id);
    if (error) {
      console.error('[yasunobu-memo/delete] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[yasunobu-memo/delete] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
