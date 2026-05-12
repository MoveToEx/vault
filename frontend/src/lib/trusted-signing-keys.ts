import { to_base64 } from "libsodium-wrappers";

const DB_NAME = "vault-trusted-signing-keys";
const DB_VERSION = 1;
const STORE_NAME = "trusted-signing-keys";

export type TrustedSigningKey = {
  id: string;
  userId: number;
  owner: string;
  publicKey: string;
  digest: string;
  trustedAt: string;
};

function getKeyId(userId: number, publicKey: string) {
  return `${userId}:${publicKey}`;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function openTrustedKeysDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("userId", "userId");
      }
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openTrustedKeysDb();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const result = await requestToPromise(callback(tx.objectStore(STORE_NAME)));
    await new Promise<void>((resolve, reject) => {
      tx.addEventListener("complete", () => resolve());
      tx.addEventListener("abort", () => reject(tx.error));
      tx.addEventListener("error", () => reject(tx.error));
    });
    return result;
  } finally {
    db.close();
  }
}

export function serializeSigningPublicKey(publicKey: Uint8Array) {
  return to_base64(publicKey);
}

export async function signingPublicKeyDigest(publicKey: Uint8Array) {
  const input = new Uint8Array(publicKey.byteLength);
  input.set(publicKey);
  const hash = await crypto.subtle.digest("SHA-256", input.buffer);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join(":");
}

export async function listTrustedSigningKeys(userId: number) {
  const keys = await withStore<TrustedSigningKey[]>("readonly", (store) =>
    store.getAll(),
  );

  return keys.filter((key) => key.userId === userId);
}

export async function trustSigningPublicKey(params: {
  userId: number;
  owner: string;
  publicKey: Uint8Array;
}) {
  const publicKey = serializeSigningPublicKey(params.publicKey);
  const trustedKey: TrustedSigningKey = {
    id: getKeyId(params.userId, publicKey),
    userId: params.userId,
    owner: params.owner,
    publicKey,
    digest: await signingPublicKeyDigest(params.publicKey),
    trustedAt: new Date().toISOString(),
  };

  await withStore<IDBValidKey>("readwrite", (store) => store.put(trustedKey));
  return trustedKey;
}
