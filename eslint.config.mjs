import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Performance guardrails: keep heavy libraries off the initial bundle and stop
// dead deps creeping back in. See docs/perf.md.
const RESTRICTED_HEAVY = [
  { name: "yjs", message: "Unused collaboration lib — do not import (bundle bloat). See docs/perf.md." },
  { name: "y-prosemirror", message: "Unused collaboration lib — do not import (bundle bloat)." },
  { name: "y-protocols", message: "Unused collaboration lib — do not import (bundle bloat)." },
  { name: "@tiptap/extension-collaboration", message: "Collaboration is not used — do not import (bundle bloat)." },
  { name: "@tiptap/y-tiptap", message: "Collaboration is not used — do not import (bundle bloat)." },
];
// The heavy Tiptap editor must stay behind next/dynamic — import it from
// `page-body-editor-lazy`, never the raw module.
const RESTRICTED_EDITOR_PATTERN = {
  group: ["**/page-body-editor"],
  message: "Import PageBodyEditor from './page-body-editor-lazy' so the editor stays off the initial bundle.",
};

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
  // Everywhere: no unused-collab libs, and no static import of the raw editor.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: RESTRICTED_HEAVY, patterns: [RESTRICTED_EDITOR_PATTERN] },
      ],
    },
  },
  // Route entry files must not import recharts directly — charts must be
  // extracted into a client component and loaded via next/dynamic so recharts
  // stays off the route's initial bundle. (Rule fully replaces the global one
  // for these files, so re-list the heavy restrictions too.)
  {
    files: ["app/**/page.tsx", "app/**/layout.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...RESTRICTED_HEAVY,
            { name: "recharts", message: "Do not import recharts in a route file — extract a client chart component and next/dynamic it (perf). See docs/perf.md." },
          ],
          patterns: [RESTRICTED_EDITOR_PATTERN],
        },
      ],
    },
  },
]);

export default eslintConfig;
