-- Guarda o PDF original da NF que deu origem a uma entrada de estoque, pra
-- o Kardex poder linkar direto pro arquivo (não só mostrar o número).
--
-- Bucket PRIVADO (não público): uma nota fiscal de fornecedor tem preço de
-- custo — dado comercialmente sensível, não é pra ficar acessível por URL
-- direta sem autenticação. Acesso via signed URL gerada na hora do clique
-- (expira rápido), nunca uma URL pública fixa salva em lugar nenhum.
--
-- Convenção de caminho: {id_loja}/{arquivo} — é o que as policies abaixo
-- usam pra escopar por loja (storage.foldername(name))[1] = id_loja).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas-fiscais', 'notas-fiscais', false, 15728640, array['application/pdf'])
on conflict (id) do nothing;

-- Upload: só Gerente (da própria loja) ou Administrador — mesma autorização
-- já aplicada em importar-estoque-nf pra quem pode dar entrada por NF.
create policy "notas_fiscais_insert" on storage.objects for insert to authenticated
with check (
    bucket_id = 'notas-fiscais'
    and (
        public.current_is_admin()
        or (
            public.current_perfil() = 'Gerente'
            and (storage.foldername(name))[1]::uuid = any(public.current_lojas_permitidas())
        )
    )
);

-- Leitura: qualquer perfil da própria loja (Vendedor também vê o Kardex) —
-- current_lojas_permitidas() já cobre Vendedor/Gerente igual em toda a app;
-- Administrador sem restrição.
create policy "notas_fiscais_select" on storage.objects for select to authenticated
using (
    bucket_id = 'notas-fiscais'
    and (
        public.current_is_admin()
        or (storage.foldername(name))[1]::uuid = any(public.current_lojas_permitidas())
    )
);

alter table public.movimentacoes_estoque
    add column if not exists arquivo_nf_path text;

comment on column public.movimentacoes_estoque.arquivo_nf_path is
    'Caminho no bucket notas-fiscais do PDF (DANFE) original que deu origem a esta entrada, quando veio de "Entrada por Nota Fiscal". NULL para entradas via CSV ou outros tipos de movimentação.';
