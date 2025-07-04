/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  safelist: [
    "bg-blue-100",
    "bg-yellow-100",
    "bg-red-100",
    "bg-green-100",
    "bg-sky-100",
    "text-white",
    "hover:bg-gray-100",  // ✅ hover effect ke liye
    "font-bold"           // ✅ selected item bold karne ke liye
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
