import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    plugin: "src/plugin/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  splitting: false,
  shims: true,
  external: [
    "terser",
    "unplugin",
    "@babel/core",
    "@babel/types",
    "@babel/parser",
    "@babel/template",
    "@babel/traverse",
    "@babel/generator",
    "@babel/preset-typescript",
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
