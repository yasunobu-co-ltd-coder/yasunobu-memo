import { NextRequest, NextResponse } from 'next/server';
import { getUserReferenceCounts } from '../../../../../lib/user-refs';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// GET /api/users/[id]/refs
// 指定ユーザーが参照されているレコード件数を返す
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const result = await getUserReferenceCounts(userId);
    return NextResponse.json({ userId, ...result });
  } catch (e) {
    console.error('[users/refs] exception:', e);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
