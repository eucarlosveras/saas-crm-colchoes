import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getAdminClient } from '../_shared/supabase-client.ts'
import { authGuard, getLojaId } from '../_shared/auth-guard.ts'

serve(async (req) => {
  const auth = await authGuard(req)
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: { 'Content-Type': 'application/json' } })
  }

  const user = auth.user
  const supabase = getAdminClient()
  const lojaId = await getLojaId(supabase, user)
  if (!lojaId) {
    return new Response(JSON.stringify({ error: 'Loja não encontrada' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  const url = new URL(req.url)
  const clientId = url.searchParams.get('id')

  if (req.method === 'GET') {
    if (clientId) {
      const { data, error } = await supabase.from('clientes').select('*').eq('id_cliente', clientId).eq('id_loja', lojaId).single()
      if (error || !data) {
        return new Response(JSON.stringify({ error: 'Cliente não encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } })
    }

    const { data, error } = await supabase.from('clientes').select('*').eq('id_loja', lojaId).order('data_criacao', { ascending: false })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ data: data || [] }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'POST') {
    const body = await req.json()
    if (!body.nome_cliente) {
      return new Response(JSON.stringify({ error: 'Nome do cliente é obrigatório' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { data, error } = await supabase.from('clientes').insert({
      nome_cliente: body.nome_cliente,
      email: body.email || null,
      whatsapp: body.whatsapp || null,
      cpf: body.cpf || null,
      id_loja: lojaId,
      id_usuario_cadastro: user.id,
      data_criacao: new Date().toISOString()
    }).select().single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ data, message: 'Cliente criado!' }), { status: 201, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'PUT') {
    const body = await req.json()
    const { id_cliente, ...camposAtualizados } = body
    if (!id_cliente) {
      return new Response(JSON.stringify({ error: 'ID do cliente é obrigatório' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { data: existing } = await supabase.from('clientes').select('id_cliente').eq('id_cliente', id_cliente).eq('id_loja', lojaId).single()
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }

    const { data, error } = await supabase.from('clientes').update({
      ...camposAtualizados,
      updated_at: new Date().toISOString()
    }).eq('id_cliente', id_cliente).select().single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'DELETE') {
    const { id_cliente } = await req.json()
    if (!id_cliente) {
      return new Response(JSON.stringify({ error: 'ID do cliente é obrigatório' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { data: existing } = await supabase.from('clientes').select('id_cliente').eq('id_cliente', id_cliente).eq('id_loja', lojaId).single()
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }

    const { error } = await supabase.from('clientes').delete().eq('id_cliente', id_cliente)
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
})