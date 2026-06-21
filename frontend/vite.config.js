import { defineConfig } from 'vite';

export default defineConfig({
  root: '../', // Set root to the parent directory where index.html is located
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
