import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      },
      colors: {
        // Base palette
        neutral: {
          0: "#FFFFFF",
          50: "#F7F8FA",
          100: "#EEF0F3",
          200: "#E2E5EA",
          300: "#C9CFD8",
          400: "#9BA4B2",
          500: "#6F7885",
          600: "#525A66",
          700: "#3B414A",
          800: "#242830",
          900: "#14171C"
        },
        brand: {
          50: "#EEF4FF",
          100: "#DCE9FF",
          200: "#BCD4FF",
          300: "#8CB5FF",
          400: "#5D95FF",
          500: "#2D74FF",
          600: "#155DE9",
          700: "#114BC0",
          800: "#113E98",
          900: "#123679"
        },
        success: {
          50: "#ECFDF3",
          500: "#12B76A",
          700: "#027A48"
        },
        warning: {
          50: "#FFFAEB",
          500: "#F79009",
          700: "#B54708"
        },
        danger: {
          50: "#FEF3F2",
          500: "#F04438",
          700: "#B42318"
        },
        // Semantic aliases
        bg: {
          canvas: "#F7F8FA",
          surface: "#FFFFFF",
          muted: "#EEF0F3",
          inverse: "#14171C"
        },
        text: {
          primary: "#14171C",
          secondary: "#525A66",
          tertiary: "#6F7885",
          disabled: "#9BA4B2",
          inverse: "#FFFFFF",
          brand: "#155DE9"
        },
        border: {
          subtle: "#E2E5EA",
          strong: "#C9CFD8",
          brand: "#8CB5FF",
          danger: "#F04438"
        }
      },
      fontSize: {
        "display-sm": ["30px", { lineHeight: "38px", fontWeight: "700" }],
        "title-lg": ["24px", { lineHeight: "32px", fontWeight: "700" }],
        "title-md": ["20px", { lineHeight: "28px", fontWeight: "700" }],
        "title-sm": ["18px", { lineHeight: "26px", fontWeight: "600" }],
        "body-lg": ["17px", { lineHeight: "26px", fontWeight: "500" }],
        "body-md": ["15px", { lineHeight: "22px", fontWeight: "500" }],
        "body-sm": ["14px", { lineHeight: "20px", fontWeight: "500" }],
        caption: ["12px", { lineHeight: "18px", fontWeight: "500" }]
      },
      spacing: {
        1.5: "0.375rem", // 6
        4.5: "1.125rem", // 18
        5.5: "1.375rem", // 22
        7.5: "1.875rem", // 30
        13: "3.25rem", // 52
        15: "3.75rem", // 60
        18: "4.5rem", // 72
        22: "5.5rem", // 88
        26: "6.5rem", // 104
        30: "7.5rem" // 120
      },
      borderRadius: {
        xs: "6px",
        sm: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "24px"
      },
      boxShadow: {
        "elevation-1": "0 1px 2px rgba(16, 24, 40, 0.08)",
        "elevation-2": "0 4px 8px rgba(16, 24, 40, 0.10)",
        "elevation-3": "0 8px 20px rgba(16, 24, 40, 0.14)",
        floating: "0 12px 32px rgba(16, 24, 40, 0.16)"
      },
      zIndex: {
        base: "1",
        sheet: "20",
        modal: "50",
        toast: "60"
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        emphasized: "cubic-bezier(0.2, 0, 0, 1.2)"
      }
    }
  },
  plugins: []
};

export default config;
