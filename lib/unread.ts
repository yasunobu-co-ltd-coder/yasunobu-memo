import { supabase } from './supabase';

// 通知の最終確認時刻を取得
export async function getLastChecked(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('yasunobu-memo-unread')
      .select('last_checked_at')
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;
    return data.last_checked_at;
  } catch (e) {
    console.error('Exception getting last_checked:', e);
    return null;
  }
}

// 通知の最終確認時刻を更新（upsert）
export async function updateLastChecked(userId: string): Promise<void> {
  try {
    await supabase
      .from('yasunobu-memo-unread')
      .upsert(
        { user_id: userId, last_checked_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
  } catch (e) {
    console.error('Exception updating last_checked:', e);
  }
}
