import { createClient } from '@supabase/supabase-js';

/**
 * Service Role Keyを使用した特権管理用のSupabaseクライアントを作成します。
 * これにより、テーブルのRLS（行セキュリティ）をバイパスして、API側から確実に保存できます。
 */
export function getSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false, // サーバーサイドのためセッション永続化は不要
        autoRefreshToken: false
      }
    }
  );
}