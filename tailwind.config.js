/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "#FAFAF8",
                foreground: "#1a1a1a",
                secondary: "#f5f5f3",
                border: "#e0e0dd",
                "muted-foreground": "#8d8d8d",
            }
        },
    },
    plugins: [],
}
