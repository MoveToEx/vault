import sodium from "libsodium-wrappers-sumo";

export type Argon2Request = {
  password: Uint8Array;
  salt: Uint8Array;
  iterations: number;
  memorySize: number;
  hashLength: number;
};

self.onmessage = async (event: MessageEvent<Argon2Request>) => {
  const params = event.data;

  await sodium.ready;

  try {
    const hash = sodium.crypto_pwhash(
      params.hashLength,
      params.password,
      params.salt,
      params.iterations,
      params.memorySize * 1024,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    );

    self.postMessage(hash);
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
