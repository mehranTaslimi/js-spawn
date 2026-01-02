import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import { createUnplugin } from 'unplugin';
import { type ResolvedConfig } from 'vite';

import { findSpawnBindings } from './findSpawnBindings';
import generate from './generate';
import { generateWorkerModule } from './generateWorkerModule';
import { importModule } from './importModule';
import { pluginParser } from './pluginParser';
import { loadTsConfigAliases, normalizeAliases } from './resolveModule';
import { buildSpawnModule } from './templates';
import traverse from './traverse';

interface GlobalConfig {
  vite: ResolvedConfig | null;
}

export const unplugin = createUnplugin(() => {
  const globalConfig: GlobalConfig = {
    vite: null,
  };
  const resolvedAliases: Record<string, string> = {};
  const emittedWorkers = new Set<string>();
  const virtualModules = new Map<string, string>();
  let VIRTUAL_PREFIX!: string;
  let VIRTUAL_WORKER_PREFIX!: string;

  return {
    name: 'js-spawn',
    enforce: 'pre',

    transform(code, id) {
      if (!/\.(t|j)sx?$/.test(id)) return;
      const plugins = pluginParser(id);

      const ast = parser.parse(code, {
        sourceType: 'module',
        plugins,
      });

      const spawnBindings = findSpawnBindings(ast);
      if (!spawnBindings.size) return;

      traverse(ast, {
        CallExpression(path) {
          const calleePath = path.get('callee');
          if (!calleePath.isIdentifier()) return;

          const binding = calleePath.scope.getBinding(calleePath.node.name);
          if (!binding) return;

          if (!spawnBindings.has(binding)) return;

          const [fnPath] = path.get('arguments');

          if (
            !fnPath.node ||
            (!fnPath.isArrowFunctionExpression() &&
              !fnPath.isFunctionExpression())
          ) {
            return;
          }

          const spawnModule = buildSpawnModule({
            URL: t.identifier('URL'),
          });

          const {
            hash: workerHash,
            out: workerModuleSrc,
            capturedVars,
          } = generateWorkerModule(resolvedAliases, fnPath, id);
          const { code: spawnModuleSrc } = generate(spawnModule);

          const workerModuleKey = `${VIRTUAL_WORKER_PREFIX}__worker__${workerHash}.js`;
          const spawnModuleKey = `${VIRTUAL_PREFIX}__spawn`;
          const spawnModuleIdent = t.identifier('__Spawn');

          virtualModules
            .set(workerModuleKey, workerModuleSrc)
            .set(spawnModuleKey, spawnModuleSrc);

          importModule(path, spawnModuleIdent, spawnModuleKey);

          const spawnIdent = path.scope.generateUidIdentifier('spawn');

          const spawnDecl = t.variableDeclaration('const', [
            t.variableDeclarator(
              spawnIdent,
              t.newExpression(spawnModuleIdent, [
                t.stringLiteral(workerModuleKey),
              ])
            ),
          ]);

          const getSpawnResultDecl = t.callExpression(
            t.memberExpression(spawnIdent, t.identifier('run')),
            [capturedVars]
          );

          path.getStatementParent()?.insertBefore(spawnDecl);
          path.replaceWith(getSpawnResultDecl);
        },
      });

      return generate(ast, undefined, code);
    },
    resolveId(id) {
      if (virtualModules.has(id)) {
        return id;
      }
    },
    load(id) {
      if (virtualModules.has(id)) {
        return virtualModules.get(id);
      }
    },
    vite: {
      configResolved(config) {
        globalConfig.vite = config;

        const viteAliases = normalizeAliases(config.resolve.alias);
        const tsconfigAliases = loadTsConfigAliases(config.root);

        Object.assign(resolvedAliases, viteAliases, tsconfigAliases);

        VIRTUAL_PREFIX = '/@virtual:js-spawn:/';
        VIRTUAL_WORKER_PREFIX =
          config.mode === 'development'
            ? '/@virtual:js-spawn:/'
            : 'virtual__js-spawn';
      },
      moduleParsed() {
        Array.from(virtualModules)
          .filter(([id]) => id.endsWith('.js'))
          .forEach(([id]) => {
            if (emittedWorkers.has(id)) return;
            emittedWorkers.add(id);
            this.emitFile({
              type: 'chunk',
              fileName: `${globalConfig.vite?.build.assetsDir}/${id}`,
              id,
            });
          });
      },
    },
  };
});

export const jsSpawnVitePlugin = unplugin.vite;
export default unplugin;
