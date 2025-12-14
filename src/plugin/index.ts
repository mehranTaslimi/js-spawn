import * as parser from "@babel/parser";
import traverseModule, { Binding } from "@babel/traverse";
import * as t from "@babel/types";
import generateModule from "@babel/generator";
import { pluginParser } from "./pluginParser";
import { createUnplugin } from "unplugin";

import { buildCreateWorker, buildWorkerResult } from "./templates";
import { importModule } from "./importModule";
import { workerToBlob } from "./workerToBlob";

const traverse: typeof traverseModule =
  (traverseModule as any).default ?? traverseModule;

const generate: typeof generateModule =
  (generateModule as any).default ?? generateModule;

export const unplugin = createUnplugin(() => {
  const spawnBindings = new Set<Binding>();
  const virtualModules = new Map<string, string>();
  const VIRTUAL_PREFIX = "/@virtual:js-spawn:/";

  return {
    name: "js-spawn",
    enforce: "pre",

    async transform(code, id) {
      if (!/\.(t|j)sx?$/.test(id)) return;

      const plugins = pluginParser(id);

      const ast = parser.parse(code, {
        sourceType: "module",
        plugins,
      });

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

      if (spawnBindings.size === 0) {
        return code;
      }

      traverse(ast, {
        CallExpression(path) {
          const calleePath = path.get("callee");
          if (!calleePath.isIdentifier()) return;

          const binding = calleePath.scope.getBinding(calleePath.node.name);
          if (!binding) return;

          if (!spawnBindings.has(binding)) return;

          const [fn, ...args] = path.node.arguments;

          if (
            !fn ||
            (!t.isArrowFunctionExpression(fn) && !t.isFunctionExpression(fn))
          ) {
            return;
          }

          const { hash, out: blob } = workerToBlob(fn, id);

          const createWorker = buildCreateWorker({
            URL: t.identifier("URL"),
            BLOB: t.stringLiteral(blob),
          });

          const workerResult = buildWorkerResult({});

          const { code: createWorkerSrc } = generate(createWorker);
          const { code: workerResultSrc } = generate(workerResult);

          const workerResultKey = `${VIRTUAL_PREFIX}__worker__result`;
          const createWorkerKey = `${VIRTUAL_PREFIX}__create__worker_${hash}`;

          const createWorkerIdent = t.identifier(`__create__worker_${hash}`);
          const workerResultIdent = t.identifier("__worker__result");

          virtualModules.set(createWorkerKey, createWorkerSrc);
          virtualModules.set(workerResultKey, workerResultSrc);

          importModule(path, createWorkerIdent, createWorkerKey);
          importModule(path, workerResultIdent, workerResultKey);

          const workerIdent = path.scope.generateUidIdentifier("worker");

          const resultCallExpr = t.callExpression(workerResultIdent, [
            workerIdent,
            ...args,
          ]);

          const creationCallExpr = t.variableDeclaration("const", [
            t.variableDeclarator(
              workerIdent,
              t.callExpression(createWorkerIdent, [])
            ),
          ]);

          path.getStatementParent()?.insertBefore(creationCallExpr);
          path.replaceWith(resultCallExpr);
        },
      });

      return generate(ast, undefined, code);
    },
    resolveId(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        return id;
      }
      return null;
    },
    load(id) {
      if (virtualModules.has(id)) {
        return virtualModules.get(id);
      }
      return null;
    },
  };
});

export const jsSpawnVitePlugin = unplugin.vite;
export const jsSpawnWebpackPlugin = unplugin.webpack;
// export const jsSpawnRollupPlugin = unplugin.rollup;
// export const jsSpawnRolldownPlugin = unplugin.rolldown;
// export const jsSpawnRspackPlugin = unplugin.rspack;
// export const jsSpawnEsbuildPlugin = unplugin.esbuild;
// export const jsSpawnFarmPlugin = unplugin.farm;

export default unplugin;
