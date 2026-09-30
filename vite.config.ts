import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './resources/js'),
      '@inertiajs/react': path.resolve(import.meta.dirname, './resources/js/lib/inertia-shim.tsx'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
