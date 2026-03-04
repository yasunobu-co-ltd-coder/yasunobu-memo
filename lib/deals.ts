import { supabase } from './supabase';

// Types
export type Tri = '高' | '中' | '低';
export type AssignmentType = '任せる' | '自分で';

export type Deal = {
  id: string;
  created_at: string;
  created_by: string;       // UUID
  client_name: string;
  memo: string;
  due_date: string;
  importance: Tri;
  profit: Tri;
  urgency: Tri;
  assignment_type: AssignmentType;
  assignee: string;          // UUID
  status: 'open' | 'done';
  image_url?: string;
  // JOIN結果
  created_user?: { name: string } | null;
  assignee_user?: { name: string } | null;
};

// リレーションselect（created_by → users, assignee → users）
const DEAL_SELECT = '*, created_user:users!yasunobu-memo_created_by_fkey(name), assignee_user:users!yasunobu-memo_assignee_fkey(name)';

// READ: 案件一覧を取得
export async function getDeals(): Promise<Deal[]> {
  try {
    const { data, error } = await supabase
      .from('yasunobu-memo')
      .select(DEAL_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching deals:', error.message);
      return [];
    }
    return (data || []) as unknown as Deal[];
  } catch (e) {
    console.error('Exception fetching deals:', e);
    return [];
  }
}

// UPDATE: 案件を更新（ステータス変更など）
export async function updateDeal(id: string, updates: Partial<Deal>): Promise<Deal | null> {
  try {
    const { data, error } = await supabase
      .from('yasunobu-memo')
      .update(updates)
      .eq('id', id)
      .select(DEAL_SELECT)
      .single();

    if (error) {
      console.error('Error updating deal:', error);
      return null;
    }
    return data as unknown as Deal;
  } catch (e) {
    console.error('Exception updating deal:', e);
    return null;
  }
}

// DELETE: 案件を削除
export async function deleteDeal(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('yasunobu-memo')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting deal:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Exception deleting deal:', e);
    return false;
  }
}
