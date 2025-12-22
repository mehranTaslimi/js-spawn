import * as t from "@babel/types";
import { Binding } from "@babel/traverse";
import traverseModule from "@babel/traverse";
import * as parser from "@babel/parser";

const traverse: typeof traverseModule =
  (traverseModule as any).default ?? traverseModule;

export const findSpawnBindings = (ast: parser.ParseResult<t.File>) => {
  const spawnBindings = new Set<Binding>();

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value !== "js-spawn") return;

      for (const spec of path.node.specifiers) {
        if (
          t.isImportSpecifier(spec) &&
          t.isIdentifier(spec.imported, { name: "spawn" })
        ) {
          const binding = path.scope.getBinding(spec.local.name);
          if (binding) spawnBindings.add(binding);
        }

        if (t.isImportDefaultSpecifier(spec)) {
          const binding = path.scope.getBinding(spec.local.name);
          if (binding) spawnBindings.add(binding);
        }
      }
    },
  });

  return spawnBindings;
};
