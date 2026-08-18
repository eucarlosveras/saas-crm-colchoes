import { defineConfig } from 'vite';

export default defineConfig({
    // O projeto é servido/publicado a partir da raiz do domínio
    // (GitHub Pages em https://eucarlosveras.github.io/saas-crm-colchoes/).
    base: './',
    build: {
        outDir: 'dist'
    }
});
