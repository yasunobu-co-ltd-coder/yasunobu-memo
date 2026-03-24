import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';

const DEAL_SELECT = '*, created_user:users!created_by(name), assignee_user:users!assignee(name)';

export async function PATCH(req: NextRequest) {
  try {
    const { id, updates } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('yasunobu-memo')
      .update(updates)
      .eq('id', id)
      .select(DEAL_SELECT)
      .single();

    if (error) {
      console.error('[yasunobu-memo/update] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deal: data });
  } catch (e) {
    console.error('[yasunobu-memo/update] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
