import tsParser from '@typescript-eslint/parser';
import adminUiPlugin from './scripts/eslint-plugin-admin-ui.mjs';

const adminRoutePageFiles = [
  'modules/admin/pages/*.tsx',
  'modules/admin/pages/ai/*.tsx',
  'modules/admin/pages/logs/*.tsx',
  'modules/admin/pages/meetings/*.tsx',
];

const adminPageFiles = [
  'modules/admin/pages/**/*.tsx',
];

const adminPageIgnores = [
  'modules/admin/pages/AdminDashboard.tsx',
  'modules/admin/pages/AdminLogin.tsx',
];

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: adminPageFiles,
    ignores: adminPageIgnores,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'admin-ui': adminUiPlugin,
    },
    rules: {
      'admin-ui/no-admin-page-visual-utilities': 'error',
    },
  },
  {
    files: adminRoutePageFiles,
    ignores: adminPageIgnores,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'antd',
              importNames: ['message', 'notification', 'Button', 'Table', 'Modal', 'Drawer'],
              message:
                'Admin route pages must use App.useApp(), AppButton, AppTable, AppModal, and AppDrawer from the admin UI layer.',
            },
            {
              name: 'lucide-react',
              message:
                'Admin route pages must use @ant-design/icons to keep the admin icon system consistent.',
            },
          ],
        },
      ],
    },
  },
];
