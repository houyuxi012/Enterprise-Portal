/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./index.tsx",
        "./App.tsx",
        "./constants.tsx",
        "./theme.ts",
        "./types.ts",
        "./components/**/*.{ts,tsx}",
        "./contexts/**/*.{ts,tsx}",
        "./layouts/**/*.{ts,tsx}",
        "./modules/**/*.{ts,tsx}",
        "./shared/**/*.{ts,tsx}",
        "./app/**/*.{ts,tsx}",
        "./services/**/*.{ts,tsx}",
        "./utils/**/*.{ts,tsx}",
        "./widgets/**/*.{ts,tsx}",
        "./builder/**/*.{ts,tsx}",
        "./router/**/*.{ts,tsx}",
        "./hooks/**/*.{ts,tsx}",
        "./i18n/**/*.{ts,tsx}",
        "./theme/**/*.{ts,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Segoe UI"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif']
            },
            colors: {
                fluent: {
                    blue: '#0078d4',
                    bg: '#f3f2f1',
                    dark: '#111111',
                    card: 'rgba(255, 255, 255, 0.7)',
                    'card-dark': 'rgba(25, 25, 25, 0.8)'
                }
            },
            borderRadius: {
                'fluent': '1.25rem',
                'organic': '2.5rem'
            }
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
