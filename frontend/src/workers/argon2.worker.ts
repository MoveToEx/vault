import { argon2id } from "hash-wasm"

export type Argon2Request = {
  password: Uint8Array
  salt: Uint8Array
  iterations: number
  memorySize: number
  parallelism: number
  hashLength: number
}

self.onmessage = async (event: MessageEvent<Argon2Request>) => {
  const params = event.data

  try {
    const hash = await argon2id({
      password: params.password,
      salt: params.salt,
      iterations: params.iterations,
      memorySize: params.memorySize,
      parallelism: params.parallelism,
      hashLength: params.hashLength,
      outputType: 'binary'
    })

    self.postMessage(hash)
  } catch (err) {
    self.postMessage({ error: String(err) })
  }
}