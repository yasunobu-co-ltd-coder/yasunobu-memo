import { supabase } from './supabase';

const TABLE = 'yasunobu-memo-reads';

export type MemoRead = {
  memo_id: string;
  user_id: string;
  user_name?: string;
};

// Record that a user has read a memo — API route経由
export async function markAsRead(memoId: string, userId: string): Promise<void> {
  try {
    await fetch('/api/reads/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo_id: memoId, user_id: userId }),
    });
  } catch (e) {
    console.error('Exception marking as read:', e);
  }
}

// Get all reads for multiple memos (batch)
export async function getReadsForMemos(memoIds: string[]): Promise<Record<string, { user_id: string; user_name: string }[]>> {
  if (memoIds.length === 0) return {};

  const { data } = await supabase
    .from(TABLE)
    .select('memo_id, user_id, user:users!user_id(name)')
    .in('memo_id', memoIds);

  const result: Record<string, { user_id: string; user_name: string }[]> = {};
  if (data) {
    for (const row of data) {
      const memoId = row.memo_id as string;
      if (!result[memoId]) result[memoId] = [];
      const userRaw = row.user as unknown;
      const userName = Array.isArray(userRaw) ? (userRaw[0]?.name ?? '?') : ((userRaw as { name: string } | null)?.name ?? '?');
      result[memoId].push({ user_id: row.user_id as string, user_name: userName });
    }
  }
  return result;
}
