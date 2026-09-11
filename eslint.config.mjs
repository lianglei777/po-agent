import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

function featureBoundary(feature) {
  return {
    files: [`src/features/${feature}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: `^@/features/(?!${feature}(?:/|$))`,
              message:
                "Features must not import other features; compose them in a layout.",
            },
          ],
        },
      ],
    },
  };
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["desktop/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["src/contracts/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(?:@/(?:server|features|layouts)(?:/|$)|next(?:/|$)|react(?:/|$)|node:|@earendil-works/)",
              message:
                "Shared API contracts must not depend on application, framework, runtime, or vendor modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^@/server/(application|ports|infrastructure|transport|composition)(/|$)",
              message: "Domain code must not depend on outer server layers.",
            },
            {
              regex:
                "^(next|react|@earendil-works/pi-ai|@earendil-works/pi-coding-agent)(/|$)",
              message: "Framework and vendor APIs do not belong in domain code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/ports/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^@/server/(application|infrastructure|transport|composition)(/|$)",
              message: "Ports may depend only on domain contracts.",
            },
            {
              regex:
                "^(next|react|@earendil-works/pi-ai|@earendil-works/pi-coding-agent)(/|$)",
              message: "Ports must not expose framework or vendor APIs.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/application/**/*.ts"],
    ignores: ["src/server/application/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^@/server/(infrastructure|transport|composition)(/|$)",
              message: "Application code may depend only on domain and ports.",
            },
            {
              regex:
                "^(next|react|@earendil-works/pi-ai|@earendil-works/pi-coding-agent)(/|$)",
              message: "Framework and vendor APIs belong behind ports.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/infrastructure/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/server/(application|transport|composition)(/|$)",
              message:
                "Infrastructure implements ports and must not depend on outer layers.",
            },
            {
              regex: "^(next|react)(/|$)",
              message: "Infrastructure must remain independent of UI frameworks.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/transport/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/server/(infrastructure|composition)(/|$)",
              message:
                "Transport must delegate through application boundaries.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/server/(application|ports|infrastructure)(/|$)",
              message:
                "Route Handlers may use composition, transport, and domain contracts only.",
            },
            {
              regex:
                "^(@earendil-works/pi-ai|@earendil-works/pi-coding-agent)(/|$)",
              message: "Route Handlers must not call vendor SDKs directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/features/**/*.{ts,tsx}",
      "src/layouts/**/*.{ts,tsx}",
      "src/lib/**/*.{ts,tsx}",
      "src/app/**/*.{ts,tsx}",
    ],
    ignores: ["src/app/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/server(/|$)",
              message:
                "UI code must use the HTTP API instead of importing server modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/(features|layouts)(/|$)",
              message:
                "UI primitives must not depend on features or application layouts.",
            },
          ],
        },
      ],
    },
  },
  {
    // 品牌图标必须经 model-brand-icon 单点引用：深路径 import 依赖包内部目录
    // 布局与精确版本，扩散引用会让升级与替换失去控制。
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/generation/model-brand-icon.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@lobehub/icons(/|$)",
              message:
                "Import brand icons from @/components/generation/model-brand-icon instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/layouts(/|$)",
              message:
                "Features must remain independent of application layouts.",
            },
          ],
        },
      ],
    },
  },
  featureBoundary("chat"),
  featureBoundary("files"),
  featureBoundary("model-providers"),
  featureBoundary("sessions"),
  featureBoundary("skills"),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".desktop-dist/**",
    ".impeccable/**",
    ".pi/**",
    ".superpowers/**",
    ".worktrees/**",
    "dist-desktop/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
