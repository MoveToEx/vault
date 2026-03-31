import sodium from "libsodium-wrappers-sumo";

export const subkeys = {
  KEK: 1,

};

const contexts = {
  KEK: 'FEKeyEnc',
}


export function kdf(umk: Uint8Array, sid: keyof typeof subkeys) {
  const krk = sodium.crypto_kdf_derive_from_key(
    sodium.crypto_kdf_KEYBYTES,
    1,
    'KDFROOT1',
    umk,
  );

  const kek = sodium.crypto_kdf_derive_from_key(
    sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
    subkeys[sid],
    contexts[sid],
    krk
  );

  return kek;
}

export type AEADResult = {
  nonce: Uint8Array,
  cipher: Uint8Array
}

export function aead(msg: Uint8Array | string, key: Uint8Array) {
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

  const cipher = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    msg, null, null, nonce, key
  );

  return { nonce, cipher };
}

export function aeadDecrypt(cipher: Uint8Array, key: Uint8Array, nonce: Uint8Array) {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher, null, nonce, key);
}

export function createComposite(nonce: Uint8Array, cipher: Uint8Array) {
  const result = new Uint8Array(nonce.length + cipher.length);

  result.set(nonce);
  result.set(cipher, nonce.length);

  return result;
}

export function unpackComposite(c: Uint8Array, nonce_length: number) {
  const nonce = c.slice(0, nonce_length);
  const cipher = c.slice(nonce_length);

  return { nonce, cipher };
}

export function aeadComposite(msg: Uint8Array | string, key: Uint8Array) {
  const { cipher, nonce } = aead(msg, key);
  return createComposite(nonce, cipher);
}

export function aeadCompositeDecrypt(c: Uint8Array, key: Uint8Array) {
  const { nonce, cipher } = unpackComposite(c, sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipher, null, nonce, key);
}