import { supabase } from './supabase';

export type User = {
  id: string;
  name: string;
  created_at: string;
  sort_order: number;
};

// ユーザー一覧を取得
export async function getUsers(): Promise<User[]> {
  try {
    const { data, error } = await supabase
      .from('user')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching users:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Exception fetching users:', e);
    return [];
  }
}

// ユーザーを追加（末尾に配置）
export async function addUser(name: string, sortOrder?: number): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('user')
      .insert([{ name, sort_order: sortOrder ?? 9999 }])
      .select()
      .single();

    if (error) {
      console.error('Error adding user:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error('Exception adding user:', e);
    return null;
  }
}

// ユーザーの並び順を更新
export async function updateUserOrder(id: string, sortOrder: number): Promise<void> {
  try {
    await supabase
      .from('user')
      .update({ sort_order: sortOrder })
      .eq('id', id);
  } catch (e) {
    console.error('Exception updating sort_order:', e);
  }
}

// ユーザーを削除
export async function deleteUser(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting user:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Exception deleting user:', e);
    return false;
  }
}
