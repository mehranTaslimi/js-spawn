import { ResolvedConfig, type Plugin } from "vite";
import * as parser from "@babel/parser";
import traverseModule, { Binding, NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import generateModule from "@babel/generator";
import { pluginParser } from "./helpers/pluginParser";
import crypto from "node:crypto";

import {
  buildVirtualModuleImport,
  buildWorkerResultFn,
  buildCreateWorker,
  buildWorkerModule,
} from "./templates";

const traverse: typeof traverseModule =
  (traverseModule as any).default ?? traverseModule;

const generate: typeof generateModule =
  (generateModule as any).default ?? generateModule;

export function jsSpawnPlugin(): Plugin {
  let config: ResolvedConfig;
  const spawnBindings = new Set<Binding>();
  const virtualModules = new Map<string, string>();
  const virtualWorkers = new Map<string, string>();
  const VIRTUAL_PREFIX = "/@virtual:js-spawn:/";
  let VIRTUAL_WORKER_PREFIX: string;

  return {
    name: "js-spawn",
    enforce: "post",

    configResolved(c) {
      config = c;

      VIRTUAL_WORKER_PREFIX =
        config.mode === "production"
          ? "virtual_js-spawn"
          : "/@virtual_js-spawn";
    },

    transform(code, id) {
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

          const programPath = path.findParent((p) =>
            p.isProgram()
          ) as NodePath<t.Program>;

          if (!programPath) {
            return;
          }

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

          // Build worker module

          const { code: fnCode } = generate(fn);

          const workerModule = buildWorkerModule({
            FN: t.identifier(fnCode),
          });

          const { code: moduleModuleSource } = generate(workerModule);

          const hash = crypto
            .createHash("md5")
            .update(moduleModuleSource)
            .digest("hex")
            .slice(0, 8);

          const workerKey = `${VIRTUAL_WORKER_PREFIX}__worker__src_${hash}.js`;

          virtualWorkers.set(workerKey, moduleModuleSource);

          //

          const createWorker = buildCreateWorker();

          const { code: createWorkerSrc } = generate(createWorker);

          virtualModules.set(
            `${VIRTUAL_PREFIX}__create__worker`,
            createWorkerSrc
          );

          const createWorkerIdent = t.identifier(`__create__worker`);

          const createWorkerImport = buildVirtualModuleImport({
            SPECIFIER: createWorkerIdent,
            SOURCE: `${VIRTUAL_PREFIX}__create__worker`,
          });

          const workerResult = buildWorkerResultFn();

          const { code: workerResultFnSrc } = generate(workerResult);

          virtualModules.set(
            VIRTUAL_PREFIX + "__worker__result",
            workerResultFnSrc
          );

          const workerResultIdent = t.identifier("__worker__result");

          const workerResultImport = buildVirtualModuleImport({
            SPECIFIER: workerResultIdent,
            SOURCE: VIRTUAL_PREFIX + "__worker__result",
          });

          programPath.unshiftContainer("body", createWorkerImport);
          programPath.unshiftContainer("body", workerResultImport);

          const workerIdent = path.scope.generateUidIdentifier("worker");

          const resultCallExpr = t.callExpression(workerResultIdent, [
            workerIdent,
            ...args,
          ]);

          const creationCallExpr = t.variableDeclaration("const", [
            t.variableDeclarator(
              workerIdent,
              t.callExpression(createWorkerIdent, [
                t.newExpression(t.identifier("URL"), [
                  t.stringLiteral(workerKey),
                  t.memberExpression(
                    t.metaProperty(
                      t.identifier("import"),
                      t.identifier("meta")
                    ),
                    t.identifier("url")
                  ),
                ]),
              ])
            ),
          ]);

          path.getStatementParent()?.insertBefore(creationCallExpr);
          path.replaceWith(resultCallExpr);
        },
      });

      return generate(ast, undefined, code);
    },
    resolveId(id) {
      if (id.startsWith(VIRTUAL_WORKER_PREFIX)) {
        return id;
      }
      if (id.startsWith(VIRTUAL_PREFIX)) {
        return id;
      }
      return null;
    },
    load(id) {
      if (id.startsWith(VIRTUAL_WORKER_PREFIX)) {
        return virtualWorkers.get(id);
      }
      if (virtualModules.has(id)) {
        return virtualModules.get(id);
      }
    },
    generateBundle() {
      Array.from(virtualWorkers).forEach(([key, value]) => {
        this.emitFile({
          type: "asset",
          fileName: `${config.build.assetsDir}/${key}`,
          source: value,
        });
      });
    },
  };
}
