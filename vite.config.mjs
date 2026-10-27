import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site (web/) built into dist/, which server.mjs serves, and (vite build --ssr) the same site rendered on the server into dist-ssr/,
// with every package bundled in: the production image keeps only the server's own dependencies. In development the API runs on :8787
// (npm run dev:server).
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  publicDir: isSsrBuild ? false : 'public',
  build: { outDir: isSsrBuild ? 'dist-ssr' : 'dist', emptyOutDir: true, sourcemap: false },
  ssr: { noExternal: true },
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': 'http://127.0.0.1:8787', '/files': 'http://127.0.0.1:8787' } },
}));
