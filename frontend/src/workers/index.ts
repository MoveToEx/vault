export type Argon2Params = {
  password: Uint8Array
  salt: Uint8Array
  iterations: number
  memorySize: number
  parallelism: number
  hashLength: number
}

export function argon2id(params: Argon2Params): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./argon2.worker.ts", import.meta.url),
      { type: "module" }
    )

    worker.onmessage = (event) => {
      const data = event.data
      worker.terminate()

      if (data?.error) reject(data.error)
      else resolve(data)
    }

    worker.onerror = (err) => {
      worker.terminate()
      reject(err)
    }

    worker.postMessage(params)
  });
}