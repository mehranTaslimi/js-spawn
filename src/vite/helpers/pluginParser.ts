import * as parser from "@babel/parser";

export const pluginParser = (id: string) => {
  const plugins: parser.ParserOptions["plugins"] = [];

  const isJSX = /\.[tj]sx$/.test(id);

  if (isJSX) plugins.push("jsx");

  return plugins;
};
