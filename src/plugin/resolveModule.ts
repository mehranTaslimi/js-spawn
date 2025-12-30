import fs from 'node:fs';
import path from 'node:path';

import { type TsconfigRaw } from 'esbuild';
import type { Alias, AliasOptions } from 'vite';

export function normalizeAliases(
  aliases: AliasOptions
): Record<string, string> {
  if (!aliases) return {};

  const normalized: Record<string, string> = {};

  if (Array.isArray(aliases)) {
    for (const alias of aliases as Alias[]) {
      if (alias.find && alias.replacement) {
        const key =
          typeof alias.find === 'string'
            ? alias.find
            : alias.find.source.replace(/^\/?\^?/, '').replace(/\$?\/?$/, '');

        normalized[key] = alias.replacement;
      }
    }
  } else if (typeof aliases === 'object') {
    Object.assign(normalized, aliases);
  }

  return normalized;
}

export function loadTsConfigAliases(root: string): Record<string, string> {
  try {
    const tsconfigPath = path.join(root, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) return {};

    const tsconfig = JSON.parse(
      fs.readFileSync(tsconfigPath, 'utf-8')
    ) as TsconfigRaw;

    const paths = tsconfig?.compilerOptions?.paths ?? {};
    const baseUrl = tsconfig?.compilerOptions?.baseUrl ?? '.';

    const aliases: Record<string, string> = {};

    for (const [key, values] of Object.entries(paths)) {
      if (Array.isArray(values) && values.length > 0) {
        // Remove /* from the end
        const aliasKey = key.replace(/\/\*$/, '');
        const aliasValue = values[0].replace(/\/\*$/, '');

        aliases[aliasKey] = path.resolve(root, baseUrl, aliasValue);
      }
    }

    return aliases;
  } catch {
    return {};
  }
}

export function resolveSourceModule(
  resolvedAliases: Record<string, string>,
  source: string,
  sourceFileId: string
): string {
  if (source.startsWith('.')) {
    const currentDir = path.dirname(sourceFileId);
    return path.resolve(currentDir, source).replace(/\\/g, '/');
  }

  if (path.isAbsolute(source)) {
    return source.replace(/\\/g, '/');
  }

  for (const [alias, replacement] of Object.entries(resolvedAliases)) {
    if (source === alias || source.startsWith(alias + '/')) {
      const resolved = source.replace(alias, replacement);
      return path.resolve(resolved).replace(/\\/g, '/');
    }
  }

  return source;
}
