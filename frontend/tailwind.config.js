/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./index.tsx",
        "./App.tsx",
        "./constants.tsx",
        "./theme.ts",
        "./types.ts",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./contexts/**/*.{js,ts,jsx,tsx}",
        "./layouts/**/*.{js,ts,jsx,tsx}",
        "./pages/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
        "./utils/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: { sans: ['Inter', 'sans-serif'] },
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
    plugins: [],
}
