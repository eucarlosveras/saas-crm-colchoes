import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // O projeto é servido/publicado a partir da raiz do domínio
    // (GitHub Pages em https://eucarlosveras.github.io/saas-crm-colchoes/).
    base: './',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                // Landing page de marketing, servida na raiz do domínio.
                main: resolve(__dirname, 'index.html'),
                // CRM propriamente dito (login + sistema), em /app/.
                app: resolve(__dirname, 'app/index.html'),
                // Cadastro self-service de lojas novas, em /cadastro/.
                cadastro: resolve(__dirname, 'cadastro/index.html'),
                // Páginas legais públicas, linkadas no cadastro e na landing.
                termos: resolve(__dirname, 'termos/index.html'),
                privacidade: resolve(__dirname, 'privacidade/index.html'),
                // Finaliza a recuperação de senha (link enviado por e-mail), em /reset-senha/.
                resetSenha: resolve(__dirname, 'reset-senha/index.html')
            }
        }
    }
});
