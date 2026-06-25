const path = require('path')

module.exports = {
  env: {
    jest: true,
    node: true,
    browser: true
  },
  extends: ['eslint:recommended', 'prettier', 'next'],
  plugins: ['@typescript-eslint', 'simple-import-sort', 'eslint-plugin-absolute-imports-only', 'prettier'],
  ignorePatterns: ['node_modules', '.next', 'out', 'next-env.d.ts', '*.config.js', '.eslintrc.js'],
  rules: {
    'prettier/prettier': 'error',
    'no-empty': [
      'error',
      {
        allowEmptyCatch: true
      }
    ],
    'no-redeclare': 'off',
    'no-console': 'error',
    'no-useless-catch': 'off',
    'no-trailing-spaces': 'error',
    'no-constant-condition': 'off',
    'no-case-declarations': 'off',
    'no-prototype-builtins': 'off',
    'no-undef': 'off',
    'no-unused-vars': 'off',
    'no-inner-declarations': 'off',
    'no-fallthrough': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }
    ],
    'import/no-anonymous-default-export': 'off',
    'no-dupe-class-members': 'off',
    'prefer-const': 'warn',
    semi: 'off',
    '@typescript-eslint/semi': ['error', 'never'],
    '@typescript-eslint/member-delimiter-style': [
      'error',
      {
        multiline: {
          delimiter: 'none',
          requireLast: false
        },
        singleline: {
          delimiter: 'semi',
          requireLast: false
        }
      }
    ],
    'comma-dangle': ['error', 'never'],
    'simple-import-sort/imports': [
      'error',
      {
        groups: [['^\\u0000', '^node:', '^@?\\w', '^', '^\\.']]
      }
    ],
    curly: 'error',
    'max-len': [
      'error',
      {
        code: 120,
        ignoreComments: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true
      }
    ],
    'arrow-spacing': 'error',
    'space-infix-ops': 'error',
    'space-before-blocks': ['error', 'always'],
    'keyword-spacing': ['error', { before: true, after: true }],
    'space-in-parens': ['error', 'never'],
    'brace-style': ['error', '1tbs', { allowSingleLine: false }],
    'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
    'no-multi-spaces': ['error'],
    'padding-line-between-statements': [
      'error',
      { blankLine: 'always', prev: '*', next: 'return' },
      {
        blankLine: 'never',
        prev: ['const', 'let', 'var'],
        next: ['const', 'let', 'var']
      },
      {
        blankLine: 'always',
        prev: ['const', 'let', 'var'],
        next: 'expression'
      },
      { blankLine: 'always', prev: 'multiline-block-like', next: '*' },
      { blankLine: 'always', prev: '*', next: 'multiline-block-like' },
      { blankLine: 'any', prev: 'empty', next: 'iife' }
    ],
    'padded-blocks': ['error', 'never'],
    'no-restricted-imports': [
      'error',
      {
        patterns: ['.yalc/**']
      }
    ]
  },
  parser: '@typescript-eslint/parser',
  settings: {
    'absolute-imports-only': {
      project: path.resolve(__dirname, 'tsconfig.json')
    },
    next: {
      rootDir: __dirname
    }
  }
}
