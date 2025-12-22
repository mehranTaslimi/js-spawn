import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';

export const extractWorkerImports = (
  path: NodePath<t.CallExpression>,
  spawnOptions: t.ArgumentPlaceholder | t.SpreadElement | t.Expression
) => {
  const result: Record<string, t.Node> = {};

  if (!t.isObjectExpression(spawnOptions)) {
    return result;
  }

  const modules: { key: string; value: string }[] = [];

  const modulesOption = spawnOptions.properties.find(
    (i) => t.isObjectProperty(i) && t.isIdentifier(i.key, { name: 'modules' })
  );

  if (
    t.isObjectProperty(modulesOption) &&
    t.isObjectExpression(modulesOption.value)
  ) {
    modulesOption.value.properties.forEach((p) => {
      if (
        t.isObjectProperty(p) &&
        t.isIdentifier(p.value) &&
        t.isIdentifier(p.key)
      ) {
        modules.push({ key: p.key.name, value: p.value.name });
      }
    });
  }

  if (!modules.length) {
    return result;
  }

  const programPath = path.findParent((p) =>
    p.isProgram()
  ) as NodePath<t.Program>;

  for (const module of modules) {
    const binding = programPath.scope.getBinding(module.value);
    if (!binding) {
      throw new Error(
        `[js-spawn] modules.${module.value} is not in scope. It must be an imported identifier.`
      );
    }

    if (
      !binding.path.isImportDefaultSpecifier() &&
      !binding.path.isImportSpecifier() &&
      !binding.path.isImportNamespaceSpecifier()
    ) {
      throw new Error(
        `[js-spawn] modules.${module.value} must be an ESM import (import ... from "...").`
      );
    }

    result[module.key] = binding.path.parentPath.node;
  }

  return result;
};
