type Primitive = null | undefined | boolean | number | string | bigint;

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

export type Cloneable =
  | void
  | Primitive
  | Date
  | ArrayBuffer
  | SharedArrayBuffer
  | DataView
  | TypedArray
  | Cloneable[]
  | { [key: string]: Cloneable }
  | Map<Cloneable, Cloneable>
  | Set<Cloneable>;

export type SpawnConfig = {};

type ValidateCloneable<T> = T extends Cloneable ? T : never;

export async function spawn<T extends () => Cloneable | Promise<Cloneable>>(
  _fn: T,
  _cfg?: SpawnConfig
): Promise<ValidateCloneable<Awaited<ReturnType<T>>>> {
  throw new Error(
    "[js-spawn] spawn() was called at runtime, but the js-spawn transform was not applied. " +
      "This usually means the bundler plugin is missing or not running for this file. " +
      "Add the plugin for your toolchain and restart the dev server/build:\n" +
      "  • Vite:    import jsSpawn from 'js-spawn/plugin'; plugins: [jsSpawn()]\n" +
      "  • Rollup:  import jsSpawn from 'js-spawn/plugin'; plugins: [jsSpawn()]\n" +
      "  • Webpack: const jsSpawn = require('js-spawn/plugin').default; plugins: [jsSpawn()]"
  );
}
