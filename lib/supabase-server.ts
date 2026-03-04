import { createClient, SupabaseClient } from '@supabase/supabase-js';

// サーバーサイド専用 Supabase クライアント（service_role キー使用）
// RLSをバイパスして全テーブルにアクセス可能
// ※ 絶対にクライアントサイドで使用しないこと

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabaseAdmin: SupabaseClient;

if (supabaseUrl && supabaseServiceRoleKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
} else {
  // ビルド時用のダミークライアント
  supabaseAdmin = createClient('https://placeholder.supabase.co', 'placeholder', {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn('SUPABASE_SERVICE_ROLE_KEY is not set. Push notifications will not work.');
  }
}

export { supabaseAdmin };
