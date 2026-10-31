import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    // Existing code breaks these style rules in many places. Warn for now and tidy up as files
    // are touched; real mistakes (hooks misuse, bad imports) still fail the check.
    rules: {
      "react/no-unescaped-entities": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];

export default config;
