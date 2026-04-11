import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Website build artifacts (separate Next.js app)
    "website/.next/**",
    "website/out/**",
    // Isolated feature worktrees (gitignored; may contain nested build artifacts)
    ".worktrees/**",
    // Installed plugin build artifacts (minified bundles, not source)
    "data/plugins/**",
    // Test coverage reports
    "coverage/**",
  ]),
  {
    rules: {
      // Kiosk app — no benefit from next/image optimization
      "@next/next/no-img-element": "off",
      // React 19 lint rules that are too strict for common valid patterns:
      // - setState in useEffect for data fetching / state sync
      // - Date.now() in useRef initial value
      // - getWeatherIcon() returning a component reference
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
      // Allow _prefixed unused vars (interface implementations, destructuring)
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  {
    files: ["**/__tests__/**"],
    rules: {
      // Tests use require() for dynamic mocking patterns
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
