import * as t from "@babel/types";
import { buildWorkerModule } from "./templates";
import generateModule from "@babel/generator";
import { transformSync } from "@babel/core";
import { minify_sync } from "terser";
import crypto from "node:crypto";

const generate: typeof generateModule =
  (generateModule as any).default ?? generateModule;

export const workerToBlob = (
  fn: t.ArrowFunctionExpression | t.FunctionExpression,
  id: string
) => {
  const { code: fnCode } = generate(fn);
  let out = fnCode;

  if (isTsOrTsx(id)) {
    const result = transformSync(fnCode, {
      babelrc: false,
      configFile: false,
      presets: [
        ["@babel/preset-typescript", { isTSX: false, allExtensions: true }],
      ],
      sourceType: "module",
      comments: false,
      compact: true,
    });

    if (result?.code) {
      out = result?.code;
    }
  }

  const workerModule = buildWorkerModule({
    FN: t.identifier(out),
  });

  const { code: moduleModuleSource } = generate(workerModule, {
    compact: true,
    minified: true,
    comments: false,
    sourceMaps: false,
  });

  const minifyResult = minify_sync(moduleModuleSource, {
    module: true,
    sourceMap: false,
    toplevel: true,
    compress: {
      passes: 2,
    },
    mangle: true,
    format: {
      comments: false,
      beautify: false,
    },
  });

  if (minifyResult.code) {
    out = minifyResult.code;
  }
  const hash = crypto.createHash("md5").update(out).digest("hex").slice(0, 8);
  return { out, hash };
};

export function isTsOrTsx(id: string): boolean {
  const clean = id.split(/[?#]/, 1)[0].toLowerCase();
  return (
    clean.endsWith(".ts") ||
    clean.endsWith(".tsx") ||
    clean.endsWith(".mts") ||
    clean.endsWith(".cts") ||
    clean.endsWith(".mtsx") ||
    clean.endsWith(".ctsx") ||
    clean.endsWith(".d.ts")
  );
}
