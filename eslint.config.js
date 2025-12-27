import tseslint from 'typescript-eslint';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import pluginReact from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-plugin-prettier/recommended';
import reactRefresh from 'eslint-plugin-react-refresh';

import globals from 'globals';

const ignores = [
  '.yarn/**/*',
  '**/dist/**',
  '**/node_modules/*',
  '**/*.d.ts',
  '**/argocd/*',
  '**/default-production/*',
  '**/build/*',
  '**/.pnp.*',
  '**/components/ui/*',
];

export default defineConfig(
  {
    ignores,
    files: ['**/*.{ts,js,jsx,tsx}'],

    extends: [
      prettier,
      js.configs.recommended,

      tseslint.configs.eslintRecommended,
      ...tseslint.configs.recommended,
      pluginReact.configs.flat.recommended,
      hooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    settings: {
      react: {
        createClass: 'createReactClass',

        pragma: 'React',
        fragment: 'Fragment',
        version: 'detect',
      },
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.es2025,
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
    rules: {
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          jsxSingleQuote: false,
          trailingComma: 'es5',
          'max-len': 100,
        },
      ],
      'react/react-in-jsx-scope': 'off',
      'react/no-unknown-property': ['error', { ignore: ['css'] }],
      'react/display-name': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // Files allowed to use node and node_env. Uncomment if needed
  // {
  //
  //   ignores,
  //   files: [], // add path globs here if needed
  //   languageOptions: {
  //     globals: {
  //       ...globals.node,
  //     },
  //   },
  // },

  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  }
);
