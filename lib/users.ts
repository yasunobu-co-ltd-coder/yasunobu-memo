import { supabase } from './supabase';

export type User = {
  id: string;
  name: string;
  sort_order: number;
};

// ユーザー一覧を取得
export async function getUsers(): Promise<User[]> {
  try {
    const t0 = performance.now();
    const { data, error } = await supabase
      .from('users')
      .select('id, name, sort_order')
      .order('sort_order', { ascending: true });

    console.log(`[perf] getUsers: ${(performance.now() - t0).toFixed(0)}ms, rows=${data?.length ?? 0}`);

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

// ユーザーを追加（末尾に配置）— API route経由
export async function addUser(name: string, sortOrder?: number): Promise<User | null> {
  try {
    const res = await fetch('/api/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sort_order: sortOrder }),
    });
    if (!res.ok) return null;
    const { user } = await res.json();
    return user as User;
  } catch (e) {
    console.error('Exception adding user:', e);
    return null;
  }
}

// ユーザーの並び順を更新 — API route経由
export async function updateUserOrder(id: string, sortOrder: number): Promise<void> {
  try {
    await fetch('/api/users/update-order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, sort_order: sortOrder }),
    });
  } catch (e) {
    console.error('Exception updating sort_order:', e);
  }
}

// ユーザーを削除 — API route経由
export async function deleteUser(id: string): Promise<boolean> {
  try {
    const res = await fetch('/api/users/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    return res.ok;
  } catch (e) {
    console.error('Exception deleting user:', e);
    return false;
  }
}
