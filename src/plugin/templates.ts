import template from "@babel/template";

export const buildWorkerModule = template.program(
  `const reply = (msg) => self.postMessage(msg);
const fn = FN;

self.onmessage = async (event) => {
  const data = event.data;
  if (!data || data.type !== "run") return;

  const args = data.args || [];
  try {
    const result = await fn(...args);
    reply({ ok: true, result });
  } catch (error) {
    reply({
      ok: false,
      error: (error && error.message) || String(error),
    });
  }
};
`,
  { placeholderPattern: /^(FN)$/ }
);

export const buildCreateWorker = template.program(
  `export default function createWorker() {
    const blob = new Blob([BLOB], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url, { type: "module" });

    let destroyed = false;

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      URL.revokeObjectURL(url);
    };

    return {worker, destroy};
  }`
);

export const buildWorkerResult = template.statement(`
export default function workerResult({worker, destroy}, ...args) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = event.data;
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      destroy();

      if (data.ok) {
        resolve(data.result);
      } else {
        reject(new Error(data.error));
      }
    };

    const onError = (err) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      destroy();
      reject(err.error || err);
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    worker.postMessage({ type: "run", args });
  });
}`);
