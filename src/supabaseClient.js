// ═══════════════════════════════════════════════════════════════
// Módulo: supabaseClient.js — cria o cliente do Supabase.
//
// As credenciais vêm de variáveis de ambiente do Vite (import.meta.env),
// lidas do arquivo .env na raiz do projeto (prefixo VITE_ obrigatório
// para o Vite expor a variável ao código do navegador). Isso substitui o
// antigo mecanismo config.js/gerar-config.js — o Vite já resolve isso
// nativamente em tempo de build, sem precisar de um script auxiliar.
// ═══════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
        'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não definidas. ' +
        'Configure-as no arquivo .env (dev) ou nas variáveis de ambiente do build (produção).'
    );
}

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { db };
