import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Vorschau: eine einzelne HTML-Datei mit Beispieldaten (kein Supabase nötig).
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  define: { 'import.meta.env.VITE_DEMO': '"1"' },
  build: { outDir: 'dist-preview', target: 'es2020' },
});
