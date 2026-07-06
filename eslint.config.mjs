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
  ]),
  // AI gateway boundary — every LLM call must route through lib/ai/gateway.ts
  // (cost tracking, caching, rate limiting, circuit breaker). Direct provider
  // SDK imports are only allowed inside lib/ai/providers/ (see the gateway
  // header). scripts/ is exempt: one-off maintenance scripts (e.g.
  // backfill-null-mode.ts) still talk to the SDK directly.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["scripts/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          // patterns (not paths) so subpath imports like 'openai/resources'
          // or '@anthropic-ai/sdk/client' can't slip past the boundary.
          patterns: [
            {
              group: ["openai", "openai/*"],
              message:
                "Direct OpenAI SDK usage is forbidden outside lib/ai/providers/ — route calls through lib/ai/gateway.ts.",
            },
            {
              group: ["@anthropic-ai/sdk", "@anthropic-ai/sdk/*"],
              message:
                "Direct Anthropic SDK usage is forbidden outside lib/ai/providers/ — route calls through lib/ai/gateway.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/ai/providers/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);

export default eslintConfig;
