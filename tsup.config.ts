import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin/agy-tools.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist/bin",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  shims: true,
});
