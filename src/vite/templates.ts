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
  `export default function createWorker(url) {
    return new Worker(new URL(url, import.meta.url), { type: "module" });
  }`
);

export const buildWorkerResult = template.statement(`
export default function workerResult(worker, ...args) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const data = event.data;
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();

      if (data.ok) {
        resolve(data.result);
      } else {
        reject(new Error(data.error));
      }
    };

    const onError = (err) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();
      reject(err.error || err);
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    worker.postMessage({ type: "run", args });
  });
}`);
