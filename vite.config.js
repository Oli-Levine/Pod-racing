import { defineConfig } from 'vite';

// Two pages: the TV (game) and the phone controller.
export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html', controller: 'controller.html' } },
    chunkSizeWarningLimit: 1200,
  },
});
