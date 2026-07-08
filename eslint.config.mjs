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
      // React 19 / React Compiler-aware lint rules that are too strict for
      // common valid patterns. We don't run React Compiler (no babel plugin,
      // no `experimental.reactCompiler` in next.config), so these are
      // soundness checks for an optimizer we don't use rather than bug
      // catchers. If we ever enable the compiler, every site they currently
      // flag will need a real refactor.
      // - set-state-in-effect: setState in useEffect for data fetching / state sync
      // - purity: Date.now() in useRef initial value
      // - static-components: getWeatherIcon() returning a component reference
      // - refs: ref-sync during render (`valuesRef.current = values`) and
      //   lazy-init refs — both common, both safe without the compiler
      // - use-memo: function calls inside dep arrays (e.g. `[d.toDateString()]`)
      //   used to derive a stable key from a Date that changes every render
      // - immutability: forward references / let-rebind patterns the compiler
      //   can't reason about but that are runtime-safe
      // - preserve-manual-memoization: deps narrower than the compiler infers
      //   (e.g. `[obj?.field]` vs inferred `[obj]`)
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/static-components": "off",
      "react-hooks/refs": "off",
      "react-hooks/use-memo": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
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
  {
    files: ["e2e/**"],
    rules: {
      // Playwright fixtures take a parameter literally named `use`; the
      // react-hooks rule mistakes `use(...)` calls for the React `use` hook.
      // These files are Node test code, not React.
      "react-hooks/rules-of-hooks": "off",
    },
  },
]);

export default eslintConfig;
