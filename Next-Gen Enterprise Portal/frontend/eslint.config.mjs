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

const adminNoSharedAntdBarrelFiles = [
  'modules/admin/pages/AdminLogin.tsx',
  'modules/admin/pages/iam/directories/*.tsx',
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
              allowTypeImports: true,
              message:
                'Admin route pages must import Ant Design runtime components from @/shared/antd or the admin UI layer, not from the antd root barrel.',
            },
            {
              name: 'lucide-react',
              message:
                'Admin route pages must use @ant-design/icons to keep the admin icon system consistent.',
            },
            {
              name: '@/shared/antd',
              allowTypeImports: true,
              message:
                'Admin route pages must avoid the shared Ant Design runtime barrel. Import runtime components from antd/es/* or the admin UI layer directly.',
            },
          ],
        },
      ],
    },
  },
  {
    files: adminNoSharedAntdBarrelFiles,
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
              name: '@/shared/antd',
              allowTypeImports: true,
              message:
                'These high-traffic admin pages must avoid the shared Ant Design runtime barrel. Import runtime components from antd/es/* or the admin UI layer directly.',
            },
          ],
        },
      ],
    },
  },
];
