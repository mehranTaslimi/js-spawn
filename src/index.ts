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
    "[js-spawn] spawn() was called at runtime but the jsSpawnPlugin transform was not applied. " +
      "Did you forget to add jsSpawnPlugin() in your vite.config.ts?"
  );
}
