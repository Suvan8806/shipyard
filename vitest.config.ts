// Vitest config. Plain object (no `vitest/config` import) so `tsc --noEmit` passes even before
// vitest is installed; vitest accepts a plain default export.
import path from 'node:path';

export default {
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts'],
    testTimeout: 30_000,
  },
};
