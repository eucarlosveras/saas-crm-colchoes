import { getAdminClient } from './supabase-client.ts'

export async function authGuard(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Token não fornecido', status: 401, user: null }
  }

  const token = authHeader.replace('Bearer ', '')
  const supabase = getAdminClient()
  
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) {
    return { error: 'Token inválido', status: 401, user: null }
  }

  return { error: null, status: 200, user, token }
}

export async function getLojaId(supabase: any, user: any) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id_loja')
    .eq('email', user.email)
    .single()
  
  if (error || !data) return null
  return data.id_loja
}