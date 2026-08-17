// Lista todos os registros da tabela "lojas" usando as credenciais do .env
// Colunas da tabela (ver estrutura_banco.json): id_loja, nome_loja, meta_mensal

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
// Prefere a service_role key (ignora RLS) quando disponível; senão usa a anon key.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Erro: defina SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY) no arquivo .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function listarLojas() {
  const { data, error } = await supabase
    .from('lojas')
    .select('*')
    .order('nome_loja', { ascending: true });

  if (error) {
    console.error('Erro ao buscar lojas:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('Nenhuma loja encontrada.');
    return;
  }

  console.log(`Total de lojas: ${data.length}\n`);
  console.table(data);
}

listarLojas();
