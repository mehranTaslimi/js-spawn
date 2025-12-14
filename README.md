# js-spawn

<p align="center">
  <img src="./docs/logo.png" alt="js-spawn logo" width="200" />
</p>

> Run functions in a Web Worker with a single call.

`js-spawn` lets you offload heavy work (hashing, parsing, image transforms, data crunching) to a Worker so the main thread stays responsive.

---

## Install

```bash
pnpm add js-spawn
# or: npm i js-spawn
# or: yarn add js-spawn
```

---

## Why

JavaScript is single-threaded… until it isn’t.

If you run heavy loops on the main thread, the UI freezes: scrolling stutters, typing lags, animations die.
`js-spawn` runs your function inside a **Worker thread** and returns the result back as a `Promise`.

---

## Usage

### Basic example (runs in a Worker)

```ts
import { spawn } from "js-spawn";

// ✅ This function executes in a Worker (off the main thread).
// ✅ spawn(...) returns the final value as a Promise (data only).
const digest = await spawn((data: Uint8Array) => {
  let h = 2166136261; // FNV-1a-ish
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}, new Uint8Array([1, 2, 3, 4]));

// 👇 Back on the main thread
console.log("Worker result:", digest);
```

### Multiple args

```ts
import { spawn } from "js-spawn";

const sum = await spawn((a: number, b: number) => a + b, 10, 32);
console.log(sum); // 42
```

### Async worker function

```ts
import { spawn } from "js-spawn";

const result = await spawn(async (n: number) => {
  // runs in worker
  await new Promise((r) => setTimeout(r, 50));
  return n * 2;
}, 21);

console.log(result); // 42
```

---

## Spawn rules (important)

Workers don’t share scope with your module. Treat the function you pass to `spawn` as **self-contained**.

### 1) No outer variables (no closures)

✅ Pass values as arguments:

```ts
const salt = 123;

const out = await spawn((x: number, salt: number) => x + salt, 10, salt);
```

❌ Don’t capture outer scope:

```ts
const salt = 123;

const out = await spawn((x: number) => x + salt, 10); // ❌ salt is not available
```

### 2) No outer functions

✅ Inline logic in the worker function:

```ts
const out = await spawn((x: number) => x * 2, 21);
```

❌ Worker can’t call your module functions:

```ts
function double(x: number) {
  return x * 2;
}

const out = await spawn((x: number) => double(x), 21); // ❌ double isn't in worker
```

### 3) Only use “spawnable” values (args + return)

Arguments and return values must be structured-clone friendly (see **Types** below).

✅ Works: JSON-like values, TypedArrays, `ArrayBuffer`, `Blob`, `File`, `ImageData`, `Map`, `Set`, `Date`, etc.  
❌ Fails: functions, DOM nodes, class instances with methods, proxies, React elements, etc.

### 4) No DOM inside the worker

Workers don’t have `window`/`document`.

✅ You can use: typed arrays, `fetch` (where supported), timers, etc.  
❌ You cannot: `document.querySelector`, direct UI APIs.

### 5) Errors are serialized

If the worker throws, `spawn` rejects. Don’t expect perfect stacks across threads.

```ts
try {
  await spawn(() => {
    throw new Error("boom");
  });
} catch (e) {
  console.error("Worker failed:", e);
}
```

---

## What you can pass

`spawn` supports structured-clone friendly values, including JSON-like types, binary types, and transferables.

### Types

- **Primitive**
  - `string | number | boolean | null | undefined | bigint`
- **JSON**
  - primitives, objects, arrays
- **Binary**
  - `ArrayBufferLike | ArrayBufferView | Blob | File | ImageData`
- **Object-like**
  - `Date | RegExp | Map | Set`
- **Transferable**
  - `ArrayBuffer | SharedArrayBuffer | MessagePort | ImageBitmap | OffscreenCanvas`

> Tip: Passing transferables (like `ArrayBuffer`) can transfer ownership instead of copying for speed.

---

## API

```ts
type SpawnPrimitive = string | number | boolean | null | undefined | bigint;

type SpawnJsonValue =
  | SpawnPrimitive
  | { [key: string]: SpawnJsonValue }
  | SpawnJsonValue[];

type SpawnBinary = ArrayBufferLike | ArrayBufferView | Blob | File | ImageData;

type SpawnObjectLike =
  | Date
  | RegExp
  | Map<SpawnValue, SpawnValue>
  | Set<SpawnValue>;

type SpawnTransferable =
  | ArrayBuffer
  | SharedArrayBuffer
  | MessagePort
  | ImageBitmap
  | OffscreenCanvas;

type SpawnValue =
  | SpawnJsonValue
  | SpawnBinary
  | SpawnObjectLike
  | SpawnTransferable;

declare function spawn<
  T extends (...args: P) => any,
  R extends ReturnType<T>,
  P extends SpawnValue[]
>(fn: T, ...args: P): Promise<R>;
```

---

## Bundler setup (required)

`js-spawn` needs a bundler plugin so it can generate/resolve the Worker code.

Install is the same package, import the plugin entry:

```ts
import jsSpawn from "js-spawn/plugin";
```

### Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import jsSpawn from "js-spawn/plugin";

export default defineConfig({
  plugins: [jsSpawn()],
});
```

### Webpack

```js
// webpack.config.js
const jsSpawn = require("js-spawn/plugin").default;

module.exports = {
  // ...
  plugins: [jsSpawn()],
};
```

### Rollup

```js
// rollup.config.js
import jsSpawn from "js-spawn/plugin";

export default {
  // ...
  plugins: [jsSpawn()],
};
```

---

## Notes / limitations

- The function you pass to `spawn` should be **self-contained**.
  - Don’t close over values; pass them as arguments.
- Worker environment is not the same as the Window environment.
- If you need shared mutation, consider `SharedArrayBuffer` + `Atomics`.

---

## License

MIT
