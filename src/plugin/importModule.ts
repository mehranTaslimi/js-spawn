import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

export const importModule = (
  path: NodePath<t.CallExpression>,
  specifier: t.Identifier,
  source: string
) => {
  const programPath = path.findParent((p) =>
    p.isProgram()
  ) as NodePath<t.Program>;

  if (!programPath) return;

  const prevImports = new Set<string>();

  for (const stmtPath of programPath.get("body")) {
    if (stmtPath.isImportDeclaration()) {
      prevImports.add(stmtPath.node.source.value);
    }
  }

  if (!prevImports.has(source)) {
    const newImport = t.importDeclaration(
      [t.importDefaultSpecifier(specifier)],
      t.stringLiteral(source)
    );
    programPath.unshiftContainer("body", newImport);
  }
};
