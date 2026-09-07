import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // .claude/worktrees は Claude Code が作る一時作業ツリー（リポジトリのコピー）で、
  // lint すると同じ違反が二重に出る。expo-prototype/node_modules は既定で除外される
  globalIgnores(['dist', '.claude']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // 全角スペース（　）を日本語UIテキストの区切りとして意図的に使っている箇所があるため、
      // テンプレートリテラル・JSXテキスト内は対象外にする
      'no-irregular-whitespace': ['error', { skipTemplates: true, skipJSXText: true }],
    },
  },
  {
    // Fast Refresh は Vite 前提のルール。expo-prototype は React Native（Metro）なので
    // Web 版（src/）にだけ適用する
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactRefresh.configs.vite],
  },
])
