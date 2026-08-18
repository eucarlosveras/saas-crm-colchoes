import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

export function getAdminClient() {
  const supabaseUrl = Deno.env.get('SB_URL')
  const supabaseServiceKey = Deno.env.get('SB_SERVICE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Variáveis SB_URL ou SB_SERVICE_KEY não configuradas!')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}