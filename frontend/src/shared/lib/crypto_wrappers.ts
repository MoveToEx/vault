import sodium, { from_string, to_string } from "libsodium-wrappers";
import type { Metadata } from "@/shared/lib/types";
import { nanoid } from "nanoid";

await sodium.ready;

function _composite<T extends Uint8Array[]>(...args: T) {
  const result = new Uint8Array(args.map(it => it.length).reduce((a, b) => a + b));
  let offset = 0;
  for (const it of args) {
    result.set(it, offset);
    offset += it.length;
  }
  return result;
}

export const Envelope = {
  encrypt(payload: Metadata, signPriv: Uint8Array, kemPub: Uint8Array): [Uint8Array, Uint8Array] {
    const { ciphertext, sharedSecret } = sodium.crypto_kem_enc(kemPub);

    const key = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
      998244353,
      'KEM_SUBK',
      sharedSecret
    );

    const subkey = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
      0,
      'KX_SUBK$',
      key
    );
    const nonce = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_NPUBBYTES,
      0,
      'KX_NONCE',
      key
    );
    const message = JSON.stringify(payload);

    const signed = sodium.crypto_sign(message, signPriv);

    return [ciphertext, sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      signed,
      null,
      null,
      nonce,
      subkey
    )];
  },

  replace(kemCipher: Uint8Array, payload: unknown, sgnPriv: Uint8Array, kemPriv: Uint8Array) {
    const sharedSecret = sodium.crypto_kem_dec(kemCipher, kemPriv);

    const key = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
      998244353,
      'KEM_SUBK',
      sharedSecret
    );
    const subkey = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
      0,
      'KX_SUBK$',
      key
    );
    const nonce = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_NPUBBYTES,
      0,
      'KX_NONCE',
      key
    );
    const message = JSON.stringify(payload);

    return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      sodium.crypto_sign(from_string(message), sgnPriv),
      null,
      null,
      nonce,
      subkey
    );
  },

  decrypt(envelope: Uint8Array, ciphertext: Uint8Array, signPub: Uint8Array, kemPri: Uint8Array): Metadata {
    const sharedSecret = sodium.crypto_kem_dec(ciphertext, kemPri);

    const key = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
      998244353,
      'KEM_SUBK',
      sharedSecret
    );

    const subkey = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
      0,
      'KX_SUBK$',
      key
    );
    const nonce = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_NPUBBYTES,
      0,
      'KX_NONCE',
      key
    );
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      envelope,
      null,
      nonce,
      subkey
    );

    return JSON.parse(to_string(sodium.crypto_sign_open(plaintext, signPub)));
  }
}

export const Log = {
  decrypt(envelope: Uint8Array, ciphertext: Uint8Array, kemPri: Uint8Array): Metadata {
    const sharedSecret = sodium.crypto_kem_dec(ciphertext, kemPri);

    const key = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
      364330789,
      'KEM_LOGK',
      sharedSecret
    );

    const subkey = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
      0,
      'KEM_AEAD',
      key
    );
    const nonce = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_NPUBBYTES,
      0,
      'KEM_NPUB',
      key
    );
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      envelope,
      null,
      nonce,
      subkey
    );

    return JSON.parse(to_string(plaintext));
  }
}

export const PublicShare = {
  encrypt(payload: Metadata, signPriv: Uint8Array): [string, Uint8Array, Uint8Array] {
    const sk = nanoid(32);

    const kem = sodium.crypto_kem_seed_keypair(from_string(sk));

    return [sk, ...Envelope.encrypt(payload, signPriv, kem.publicKey)];
  },
  decrypt(envelope: Uint8Array, ciphertext: Uint8Array, signPub: Uint8Array, sk: string): Metadata {
    const kem = sodium.crypto_kem_seed_keypair(from_string(sk));
    return Envelope.decrypt(envelope, ciphertext, signPub, kem.privateKey);
  }
}

export const PrivateKey = {
  encrypt(umk: Uint8Array, privateKey: Uint8Array) {
    const kek = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
      0,
      'PRIV_KEY',
      umk
    );
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_IETF_NPUBBYTES);

    return _composite(
      nonce,
      sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        privateKey,
        null,
        null,
        nonce,
        kek
      )
    );
  },

  decrypt(umk: Uint8Array, composite: Uint8Array) {
    const kek = sodium.crypto_kdf_derive_from_key(
      sodium.crypto_aead_xchacha20poly1305_IETF_KEYBYTES,
      0,
      'PRIV_KEY',
      umk
    );
    const nonce = composite.slice(0, sodium.crypto_aead_xchacha20poly1305_IETF_NPUBBYTES);
    const ciphertext = composite.slice(sodium.crypto_aead_xchacha20poly1305_IETF_NPUBBYTES);
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      kek
    );
  },
}

export const FileContent = {
  encrypt(content: Uint8Array, key: Uint8Array) {
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_IETF_NPUBBYTES);
    const result = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      content,
      null,
      null,
      nonce,
      key
    );

    return _composite(nonce, result);
  },

  decrypt(composite: Uint8Array, key: Uint8Array) {
    const nonce = composite.slice(0, sodium.crypto_aead_xchacha20poly1305_IETF_NPUBBYTES);
    const cipher = composite.slice(sodium.crypto_aead_xchacha20poly1305_IETF_NPUBBYTES);
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      cipher,
      null,
      nonce,
      key
    );
  }
}