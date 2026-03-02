import { supabase } from './supabase';

// Types
export type Tri = '高' | '中' | '低';
export type AssignmentType = '任せる' | '自分で';

export type Deal = {
  id: string;
  created_at: string;
  created_by: string;
  client_name: string;
  memo: string;
  due_date: string;
  importance: Tri;
  profit: Tri;
  urgency: Tri;
  assignment_type: AssignmentType;
  assignee: string;
  status: 'open' | 'done';
  image_url?: string; // 写真URL
};

// CREATE: 新規案件を作成
export async function createDeal(deal: Omit<Deal, 'id' | 'created_at'>): Promise<Deal | null> {
  try {
    console.log('Creating deal:', deal);
    const { data, error } = await supabase
      .from('yasunobu-memo')
      .insert([deal])
      .select()
      .single();

    if (error) {
      console.error('Error creating deal:', JSON.stringify(error, null, 2));
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      return null;
    }
    console.log('Deal created:', data);
    return data;
  } catch (e) {
    console.error('Exception creating deal:', e);
    return null;
  }
}

// READ: 案件一覧を取得
export async function getDeals(): Promise<Deal[]> {
  try {
    console.log('Fetching deals...');
    const { data, error } = await supabase
      .from('yasunobu-memo')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching deals:', JSON.stringify(error, null, 2));
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error hint:', error.hint);
      console.error('Error details:', error.details);
      return [];
    }
    console.log('Deals fetched:', data?.length || 0, 'items');
    return data || [];
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
      .select()
      .single();

    if (error) {
      console.error('Error updating deal:', error);
      return null;
    }
    return data;
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
