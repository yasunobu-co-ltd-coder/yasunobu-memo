import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { name, sort_order } = await req.json();
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('users')
      .insert([{ name, sort_order: sort_order ?? 9999 }])
      .select()
      .single();

    if (error) {
      console.error('[users/create] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ user: data });
  } catch (e) {
    console.error('[users/create] exception:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
