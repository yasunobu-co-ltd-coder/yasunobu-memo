import { supabaseAdmin } from './supabase-server';

export interface UserReferenceCounts {
  pocket_yasunobu: number;
  memo_created: number;
  memo_assigned: number;
  memo_unread: number;
  push_subs: number;
  notif_triggered: number;
}

/**
 * 指定ユーザーが参照されている各テーブルのレコード件数を返す
 */
export async function getUserReferenceCounts(userId: string): Promise<{
  counts: UserReferenceCounts;
  canDelete: boolean;
}> {
  const [
    pocketYasunobu,
    memoCreated,
    memoAssigned,
    memoUnread,
    pushSubs,
    notifTriggered,
  ] = await Promise.all([
    supabaseAdmin
      .from('pocket-yasunobu')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabaseAdmin
      .from('yasunobu-memo')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', userId),
    supabaseAdmin
      .from('yasunobu-memo')
      .select('*', { count: 'exact', head: true })
      .eq('assignee', userId),
    supabaseAdmin
      .from('yasunobu-memo-unread')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabaseAdmin
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabaseAdmin
      .from('notification_log')
      .select('*', { count: 'exact', head: true })
      .eq('triggered_by_user_id', userId),
  ]);

  const counts: UserReferenceCounts = {
    pocket_yasunobu: pocketYasunobu.count ?? 0,
    memo_created: memoCreated.count ?? 0,
    memo_assigned: memoAssigned.count ?? 0,
    memo_unread: memoUnread.count ?? 0,
    push_subs: pushSubs.count ?? 0,
    notif_triggered: notifTriggered.count ?? 0,
  };

  const canDelete = Object.values(counts).every(c => c === 0);

  return { counts, canDelete };
}
