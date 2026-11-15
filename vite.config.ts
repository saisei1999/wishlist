import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base keeps the Pages subpath working without configuration.
  base: './',
  build: { target: 'es2022' },
});
