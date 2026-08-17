// Gera config.js a partir do .env, para ser carregado pelo navegador antes do app.js.
// Assim as credenciais do Supabase NÃO ficam com valor literal no código principal (app.js).
//
// IMPORTANTE: apenas a URL e a ANON KEY (chave pública) são expostas aqui.
// A SUPABASE_SERVICE_ROLE_KEY nunca deve ir para um arquivo carregado pelo navegador.
//
// Rode "node gerar-config.js" sempre que o .env mudar.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Erro: defina SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env');
  process.exit(1);
}

const conteudo = `// Arquivo gerado automaticamente por gerar-config.js a partir do .env.
// NÃO versionar (já está no .gitignore). NÃO editar manualmente.
window.APP_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(SUPABASE_URL)},
  SUPABASE_ANON_KEY: ${JSON.stringify(SUPABASE_ANON_KEY)}
};
`;

fs.writeFileSync(path.join(__dirname, 'config.js'), conteudo);
console.log('config.js gerado com sucesso a partir do .env.');
