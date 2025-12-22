import type { NodePath } from '@babel/core';
import * as t from '@babel/types';

export type ModuleRef =
  | { kind: 'default'; local: string; source: string }
  | { kind: 'named'; local: string; imported: string; source: string }
  | { kind: 'namespace'; local: string; source: string };

export const captureModulesAndVars = (
  fnPath: NodePath<t.ArrowFunctionExpression> | NodePath<t.FunctionExpression>
) => {
  const capturedModules = new Map<string, ModuleRef>();
  const capturedVars = new Set<string>();

  fnPath.traverse({
    Identifier(path) {
      const { name } = path.node;
      const binding = path.scope.getBinding(name);

      if (!binding) return;

      const bindingFnParent = binding.scope.getFunctionParent();
      if (bindingFnParent === path.scope) return;

      if (binding.path.isImportDefaultSpecifier()) {
        const importDecl = binding.path.parentPath.node as t.ImportDeclaration;
        capturedModules.set(name, {
          kind: 'default',
          local: name,
          source: importDecl.source.value,
        });
        return;
      }

      if (binding.path.isImportNamespaceSpecifier()) {
        const importDecl = binding.path.parentPath.node as t.ImportDeclaration;
        capturedModules.set(name, {
          kind: 'namespace',
          local: name,
          source: importDecl.source.value,
        });
        return;
      }

      if (binding.path.isImportSpecifier()) {
        const importDecl = binding.path.parentPath.node as t.ImportDeclaration;
        const importedNode = binding.path.node.imported;
        const imported = t.isIdentifier(importedNode)
          ? importedNode.name
          : importedNode.value;

        capturedModules.set(name, {
          kind: 'named',
          local: name,
          imported,
          source: importDecl.source.value,
        });
        return;
      }

      if (binding.path.isFunctionDeclaration()) {
        throw new Error(
          `Cannot capture function '${name}' in spawn. Functions cannot be transferred to workers.\n` +
            `Consider restructuring your code to define functions inside the spawn callback instead.`
        );
      }

      if (binding.path.isClassDeclaration()) {
        throw new Error(
          `Cannot capture class '${name}' in spawn. Class instances cannot be transferred to workers.\n` +
            `Consider passing plain objects or restructuring your code.`
        );
      }

      if (binding.path.isVariableDeclarator()) {
        const init = binding.path.get('init');

        if (init.isFunctionExpression() || init.isArrowFunctionExpression()) {
          throw new Error(
            `Cannot capture function '${name}' in spawn. Functions cannot be transferred to workers.\n` +
              `Consider restructuring your code to define functions inside the spawn callback instead.`
          );
        }

        capturedVars.add(name);
        return;
      }

      if (binding.kind === 'param' || binding.kind === 'local') {
        capturedVars.add(name);
      }
    },
  });

  return { capturedModules, capturedVars };
};
