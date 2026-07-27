import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/release/**",
      "**/build/**",
      // Generated model catalog (~22k lines, produced from models_dump.json)
      "packages/studio/src/models.js",
      "src/lib/models.js",
      // Git submodules: linted (and owned) by their own upstream repos
      "packages/Vibe-Workflow/**",
      "packages/Open-Poe-AI/**",
      "packages/Open-AI-Design-Agent/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
