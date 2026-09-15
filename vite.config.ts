import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // maplibre instancie son worker en `{ type: 'module' }` : le bundle worker
  // doit sortir en ESM, sinon il est chargé comme module et échoue.
  worker: {
    format: 'es',
  },
});
