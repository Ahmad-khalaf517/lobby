// @ts-check
import rootConfig from '../../eslint.config.js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...rootConfig,
  {
    ignores: ['eslint.config.mjs', '**/eslint.config.*'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: [
          './tsconfig.app.json',
          './tsconfig.spec.json',
          '../../packages/shared/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
