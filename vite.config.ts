import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Ensure relative paths for assets so it works on any domain/subdirectory
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
});