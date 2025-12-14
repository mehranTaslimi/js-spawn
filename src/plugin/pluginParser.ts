import * as parser from "@babel/parser";

import type { ParserOptions } from "@babel/parser";

export const pluginParser = (id: string): ParserOptions["plugins"] => {
  const plugins: NonNullable<ParserOptions["plugins"]> = [];

  const isTS = /\.[cm]?tsx?$/.test(id);
  const isJSX = /\.[cm]?[jt]sx$/.test(id);

  if (isJSX) plugins.push("jsx");
  if (isTS) plugins.push("typescript");

  plugins.push(
    "importMeta",
    "topLevelAwait",
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "dynamicImport"
  );

  return plugins;
};
