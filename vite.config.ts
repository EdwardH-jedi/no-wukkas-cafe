import { defineConfig } from 'vitest/config';

// This game runs on its own port. Older sibling projects (~/Desktop/Developer/cafe*) claim 5173
// with strictPort; sharing it made `npm run dev` here slide silently to another port while
// localhost:5173 kept showing their placeholder page. strictPort makes a clash loud instead.
export const DEV_PORT = 5183;

export default defineConfig({
  server: { port: DEV_PORT, strictPort: true },
  preview: { port: 4183, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
