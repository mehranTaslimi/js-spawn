import { ResolvedConfig, type Plugin } from "vite";
import * as parser from "@babel/parser";
import traverseModule, { Binding, NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import generateModule from "@babel/generator";
import { pluginParser } from "./helpers/pluginParser";
import crypto from "node:crypto";

import {
  buildCreateWorker,
  buildWorkerModule,
  buildWorkerResult,
} from "./templates";
import { importModule } from "./helpers/importModule";

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

          const { code: fnCode } = generate(fn);

          const workerResultKey = `${VIRTUAL_PREFIX}__worker__result`;
          const createWorkerKey = `${VIRTUAL_PREFIX}__create__worker`;

          const workerModule = buildWorkerModule({
            FN: t.identifier(fnCode),
          });
          const createWorker = buildCreateWorker({ URL: t.identifier("URL") });
          const workerResult = buildWorkerResult({});

          const { code: createWorkerSrc } = generate(createWorker);
          const { code: workerResultSrc } = generate(workerResult);
          const { code: moduleModuleSource } = generate(workerModule);

          virtualModules.set(createWorkerKey, createWorkerSrc);
          virtualModules.set(workerResultKey, workerResultSrc);

          const hash = crypto
            .createHash("md5")
            .update(moduleModuleSource)
            .digest("hex")
            .slice(0, 8);

          const workerKey = `${VIRTUAL_WORKER_PREFIX}__worker__src_${hash}.js`;
          virtualWorkers.set(workerKey, moduleModuleSource);

          const createWorkerIdent = t.identifier(`__create__worker`);
          const workerResultIdent = t.identifier("__worker__result");

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
              t.callExpression(createWorkerIdent, [t.stringLiteral(workerKey)])
            ),
          ]);

          path.getStatementParent()?.insertBefore(creationCallExpr);
          path.replaceWith(resultCallExpr);
        },
      });

      return generate(ast, undefined, code);
    },
    resolveId(id) {
      if (
        id.startsWith(VIRTUAL_WORKER_PREFIX) ||
        id.startsWith(VIRTUAL_PREFIX)
      ) {
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
      return null;
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
