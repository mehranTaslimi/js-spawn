import * as t from "@babel/types";
import { ModuleRef } from "./captureModulesAndVars";

export const createImportsFromCapturedModules = (
  capturedModules: Map<string, ModuleRef>
) => {
  const imports: t.ImportDeclaration[] = [];

  if (!capturedModules.size) {
    return imports;
  }

  const bySource = new Map<string, ModuleRef[]>();

  for (const moduleRef of capturedModules.values()) {
    if (!bySource.has(moduleRef.source)) {
      bySource.set(moduleRef.source, []);
    }
    bySource.get(moduleRef.source)!.push(moduleRef);
  }

  for (const [source, refs] of bySource) {
    const specifiers: (
      | t.ImportSpecifier
      | t.ImportDefaultSpecifier
      | t.ImportNamespaceSpecifier
    )[] = [];

    for (const ref of refs) {
      switch (ref.kind) {
        case "default": {
          specifiers.push(t.importDefaultSpecifier(t.identifier(ref.local)));
          break;
        }
        case "named": {
          specifiers.push(
            t.importSpecifier(
              t.identifier(ref.local),
              t.identifier(ref.imported)
            )
          );
          break;
        }
        case "namespace": {
          specifiers.push(t.importNamespaceSpecifier(t.identifier(ref.local)));
          break;
        }
      }
    }
    imports.push(t.importDeclaration(specifiers, t.stringLiteral(source)));
  }

  return imports;
};
