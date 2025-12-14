export type SpawnPrimitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint;

export type SpawnJsonValue =
  | SpawnPrimitive
  | { [key: string]: SpawnJsonValue }
  | SpawnJsonValue[];

export type SpawnBinary =
  | ArrayBufferLike
  | ArrayBufferView
  | Blob
  | File
  | ImageData;

export type SpawnObjectLike =
  | Date
  | RegExp
  | Map<SpawnValue, SpawnValue>
  | Set<SpawnValue>;

export type SpawnTransferable =
  | ArrayBuffer
  | SharedArrayBuffer
  | MessagePort
  | ImageBitmap
  | OffscreenCanvas;

export type SpawnValue =
  | SpawnJsonValue
  | SpawnBinary
  | SpawnObjectLike
  | SpawnTransferable;

export async function spawn<
  T extends (...args: P) => any,
  R extends ReturnType<T>,
  P extends SpawnValue[]
>(_fn: T, ..._args: P): Promise<R> {
  throw new Error(
    "[js-spawn] spawn() was called at runtime, but the js-spawn transform was not applied. " +
      "This usually means the bundler plugin is missing or not running for this file. " +
      "Add the plugin for your toolchain and restart the dev server/build:\n" +
      "  • Vite:    import jsSpawn from 'js-spawn/plugin'; plugins: [jsSpawn()]\n" +
      "  • Rollup:  import jsSpawn from 'js-spawn/plugin'; plugins: [jsSpawn()]\n" +
      "  • Webpack: const jsSpawn = require('js-spawn/plugin').default; plugins: [jsSpawn()]"
  );
}
