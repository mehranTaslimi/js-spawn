import crypto from 'node:crypto';

import { transformSync } from '@babel/core';
import type { NodePath } from '@babel/core';
import presetTypescript from '@babel/preset-typescript';
import * as t from '@babel/types';

import { addCapturedVariablesAsParams } from './addCapturedVariablesAsParams';
import { captureModulesAndVars } from './captureModulesAndVars';
import { createImportsFromCapturedModules } from './createImportsFromCapturedModules';
import generate from './generate';
import { buildWorkerModule } from './templates';

const isTsFile = (id: string): boolean => {
  const clean = id.split(/[?#]/, 1)[0].toLowerCase();
  return (
    clean.endsWith('.ts') ||
    clean.endsWith('.tsx') ||
    clean.endsWith('.mts') ||
    clean.endsWith('.cts')
  );
};

const transformTypeScriptToJavaScript = (
  code: string,
  isTSX: boolean
): string => {
  const result = transformSync(code, {
    babelrc: false,
    configFile: false,
    presets: [
      [
        presetTypescript,
        {
          isTSX,
          allExtensions: true,
          onlyRemoveTypeImports: true,
        },
      ],
    ],
    sourceType: 'module',
  });

  return result?.code ?? code;
};

export const generateWorkerModule = (
  resolvedAliases: Record<string, string>,
  fnPath: NodePath<t.ArrowFunctionExpression> | NodePath<t.FunctionExpression>,
  sourceFileId: string
) => {
  const { capturedModules, capturedVars } = captureModulesAndVars(
    sourceFileId,
    resolvedAliases,
    fnPath
  );
  const importsAst = createImportsFromCapturedModules(capturedModules);
  const { objectExpression, objectPattern } =
    addCapturedVariablesAsParams(capturedVars);

  fnPath.node.params = [objectPattern, ...fnPath.node.params];

  let { code: fnCode } = generate(fnPath.node);

  if (isTsFile(sourceFileId)) {
    const isTSX = sourceFileId.toLowerCase().endsWith('.tsx');
    fnCode = transformTypeScriptToJavaScript(fnCode, isTSX);
  }

  const workerModule = buildWorkerModule({
    FN: t.identifier(fnCode),
  });

  workerModule.body.unshift(...importsAst);

  const { code: workerModuleCode } = generate(workerModule);

  const hash = crypto
    .createHash('md5')
    .update(workerModuleCode)
    .digest('hex')
    .slice(0, 8);

  return {
    out: workerModuleCode,
    hash,
    capturedVars: objectExpression,
  };
};
