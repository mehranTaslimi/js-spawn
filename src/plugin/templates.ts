import template from "@babel/template";

export const buildWorkerModule = template.program(`
const reply = (msg) => self.postMessage(msg);

const fn = FN;

self.onmessage = async (event) => {
  const data = event?.data;
  if (!data || data.type !== "run") return;

  try {
    const result = await fn(data.value);
    reply({ ok: true, result });
  } catch (error) {
    reply({ ok: false, error: error?.message || String(error) });
  }
};
`);

export const buildSpawnModule = template.program(`
export default class Spawn {
  #url;
  #worker;
  #destroyed = false;

  constructor(url) {

    if (typeof globalThis.Worker === "undefined") {
      throw new Error(
        "[js-spawn] Web Workers are not available in this runtime.\\n" +
        "You're likely running in SSR/server (or another non-browser environment).\\n" +
        "Run spawn() on the client only (after hydration), or disable SSR for this module/page."
      );
    }

    this.#url = url;
    this.#worker = new Worker(new URL(url, import.meta.url), { type: "module" });
  }

  #isPlainObject(value) {
    if (!value || typeof value !== "object") return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  #assertCloneable(value, path = "captured") {
    if (value === null || value === undefined) return;

    const t = typeof value;
    if (t === "function") throw new TypeError(path + ": functions cannot be sent to spawn.");
    if (t === "symbol") throw new TypeError(path + ": symbols cannot be sent to spawn.");
    if (t !== "object") return;

    if (value instanceof WeakMap || value instanceof WeakSet) {
      throw new TypeError(path + ": WeakMap/WeakSet are not structured cloneable.");
    }

    if (globalThis.Window && value instanceof globalThis.Window) {
      throw new TypeError(path + ": Window cannot be sent to spawn.");
    }

    if (globalThis.Node && value instanceof globalThis.Node) {
      throw new TypeError(path + ": DOM nodes cannot be sent to spawn.");
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        this.#assertCloneable(value[i], path + "[" + i + "]");
      }
      return;
    }

    if (this.#isPlainObject(value)) {
      for (const key of Object.keys(value)) {
        this.#assertCloneable(value[key], path + "." + key);
      }
      return;
    }

    if (value instanceof Map) {
      let i = 0;
      for (const [k, v] of value.entries()) {
        this.#assertCloneable(k, path + "<Map key " + i + ">");
        this.#assertCloneable(v, path + "<Map value " + i + ">");
        i++;
      }
      return;
    }

    if (value instanceof Set) {
      let i = 0;
      for (const v of value.values()) {
        this.#assertCloneable(v, path + "<Set[" + i + "]>");
        i++;
      }
    }
  }

  #collectTransferable(value) {
    const transferables = [];
    const seen = new WeakSet();
    const added = new WeakSet();

    const add = (obj) => {
      if (!obj || added.has(obj)) return;
      added.add(obj);
      transferables.push(obj);
    };

    const isTransferable = (v) =>
      v instanceof ArrayBuffer ||
      (globalThis.MessagePort && v instanceof globalThis.MessagePort) ||
      (globalThis.OffscreenCanvas && v instanceof globalThis.OffscreenCanvas) ||
      (globalThis.ImageBitmap && v instanceof globalThis.ImageBitmap);

    const isView = (v) =>
      typeof ArrayBuffer !== "undefined" &&
      typeof ArrayBuffer.isView === "function" &&
      ArrayBuffer.isView(v);

    const isPlainObject = (v) => {
      if (!v || typeof v !== "object") return false;
      const proto = Object.getPrototypeOf(v);
      return proto === Object.prototype || proto === null;
    };

    const walk = (v) => {
      if (!v || typeof v !== "object") return;
      if (seen.has(v)) return;
      seen.add(v);

      if (isTransferable(v)) {
        add(v);
        return;
      }

      if (isView(v)) {
        add(v.buffer);
        return;
      }

      if (Array.isArray(v)) {
        for (const item of v) walk(item);
        return;
      }

      if (isPlainObject(v)) {
        for (const key of Object.keys(v)) walk(v[key]);
      }
    };

    walk(value);
    return transferables;
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;

    this.#worker.onmessage = null;
    this.#worker.onerror = null;
    this.#worker.onmessageerror = null;
    // this.#worker.terminate();
  }

  async run(value) {
    if (this.#destroyed) throw new Error("Spawn instance has been destroyed");

    this.#assertCloneable(value);

    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.#worker.removeEventListener("message", onMessage);
        this.#worker.removeEventListener("error", onError);
        this.destroy();
      };

      const onMessage = (event) => {
        cleanup();
        const { ok, result, error } = event?.data || {};
        if (ok) resolve(result);
        else reject(new Error(error || "Worker execution failed"));
      };

      const onError = (event) => {
        cleanup();
        reject(new Error(event?.message || "Worker error"));
      };

      this.#worker.addEventListener("message", onMessage);
      this.#worker.addEventListener("error", onError);

      const message = { type: "run", value };
      const transferables = this.#collectTransferable(value);

      try {
        this.#worker.postMessage(message, transferables);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}
`);
