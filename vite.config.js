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
                app: resolve(__dirname, 'app/index.html')
            }
        }
    }
});
