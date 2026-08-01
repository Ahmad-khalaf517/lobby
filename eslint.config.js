// Root ESLint flat config — the shared baseline every workspace (apps/api, apps/web,
// packages/shared) inherits. App-specific configs extend this array and add
// framework rules (NestJS/Angular) on top — they should not redefine these base rules.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.angular/**',
      '**/coverage/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Turns off ESLint stylistic rules that would conflict with Prettier.
  // Prettier owns formatting; ESLint owns code quality. Keep this last.
  eslintConfigPrettier,
);
