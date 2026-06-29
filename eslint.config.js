import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // We rely on noUncheckedIndexedAccess and use `!` deliberately at proven-safe sites.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['scripts/**', 'eslint.config.js'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
);
