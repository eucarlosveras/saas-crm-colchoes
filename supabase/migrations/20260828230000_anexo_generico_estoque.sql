-- Generaliza o anexo de arquivo numa movimentação de estoque — antes só
-- Nota Fiscal (PDF), agora qualquer cadastro manual também pode anexar um
-- arquivo (imagem, planilha, etc.).
--
-- Renomeia a coluna: nome antigo (arquivo_nf_path) ficou impreciso agora
-- que não é mais exclusivo de NF. Rename puro, sem perda de dado.
ALTER TABLE public.movimentacoes_estoque
    RENAME COLUMN arquivo_nf_path TO arquivo_anexo_path;

COMMENT ON COLUMN public.movimentacoes_estoque.arquivo_anexo_path IS
    'Caminho no bucket notas-fiscais do arquivo anexado a esta movimentação (PDF da NF, ou anexo de um cadastro manual — imagem, planilha etc.). NULL quando não há anexo.';

-- Amplia os formatos aceitos no bucket (era só application/pdf).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
WHERE id = 'notas-fiscais';
