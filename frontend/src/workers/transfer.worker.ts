import { aeadComposite, aeadCompositeDecrypt, kdf, open, seal } from "@/lib/crypto";
import type {
  FileMetadata,
  TransferCommand,
  TransferMessage,
  WithId,
  WorkerRequest,
  WorkerResponse,
} from "@/lib/types";
import { from_base64, to_string } from "libsodium-wrappers-sumo";
import axios, { AxiosError } from "axios";
import sodium from "libsodium-wrappers-sumo";

async function rpc<R extends WorkerRequest>(
  req: R,
): Promise<Extract<WorkerResponse, { type: R["type"] }>> {
  return new Promise((resolve, reject) => {
    const $id = crypto.randomUUID();

    const listener = (
      event: MessageEvent<WithId<Extract<WorkerResponse, { type: R["type"] }>>>,
    ) => {
      if (event.data.type === req.type && event.data.$id === $id) {
        self.removeEventListener("message", listener);

        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      }
    };

    self.addEventListener("message", listener);

    self.postMessage({ ...req, $id });
  });
}

function post<R extends TransferMessage>(message: R) {
  self.postMessage(message);
}

async function upload(file: File, parentId: number, umk: Uint8Array, publicKey: Uint8Array) {
  const transferId = crypto.randomUUID();

  try {
    await sodium.ready;

    post({
      type: "transfer-created",
      transferId,
      kind: "upload",
      filename: file.name,
      size: file.size,
    });

    const kek = kdf(umk, "KEK");
    const fek = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();

    const metadata = seal(
      JSON.stringify({
        name: file.name,
        mime: file.type,
        type: "file",
      }),
      publicKey,
    );

    const { id, chunks, chunkSize } = await rpc({
      type: "init",
      metadata,
      parentId,
      size: file.size,
      transferId,
    });

    post({
      type: "transfer-started",
      transferId,
      chunks,
      chunkSize,
    });

    let acc = 0;

    for (let i = 0; i < chunks; ++i) {
      let sent = 0;

      post({
        type: "chunk-started",
        chunkIndex: i,
        transferId,
      });

      const { url } = await rpc({
        type: "presign",
        uploadId: id,
        chunkIndex: i,
        transferId,
      });

      const slice = file.slice(i * chunkSize, (i + 1) * chunkSize);

      const body = aeadComposite(await slice.bytes(), fek);

      await axios.put(url, body, {
        headers: {
          "Content-Type": "application/octet-stream",
        },
        onUploadProgress(e) {
          sent = e.loaded;
          post({
            type: "chunk-progress",
            sent: e.loaded,
            chunkIndex: i,
            transferId,
          });
          post({
            type: "transfer-progress",
            sent: acc + sent,
            transferId,
          });
        },
      });

      acc += sent;

      await rpc({
        type: "chunk-ack",
        uploadId: id,
        chunkIndex: i,
        size: slice.size,
        transferId,
      });

      post({
        type: "chunk-complete",
        transferId,
        chunkIndex: i,
      });
    }

    const efek = aeadComposite(fek, kek);

    await rpc({
      type: "ack",
      uploadId: id,
      encryptedKey: efek,
      transferId,
    });

    post({
      type: "transfer-complete",
      transferId,
    });
  } catch (e) {
    let message = "unknown error";

    if (e instanceof AxiosError) {
      message = e.response?.data?.error ?? e.response?.statusText;
    } else if (e instanceof Error) {
      message = e.message;
    }

    post({
      type: "transfer-error",
      transferId,
      error: message,
    });
  }
}

async function download(fileId: number, umk: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array) {
  await sodium.ready;
  const transferId = crypto.randomUUID();

  try {
    post({
      type: "transfer-created",
      transferId,
      kind: "download",
      filename: "-",
      size: 0,
    });

    const { chunks, chunkSize, size, encryptedKey, encryptedMetadata } =
      await rpc({
        type: "get-file",
        fileId,
        transferId,
      });

    const kek = kdf(umk, "KEK");
    const fek = aeadCompositeDecrypt(from_base64(encryptedKey), kek);

    const metadata: FileMetadata = JSON.parse(
      to_string(open(from_base64(encryptedMetadata), publicKey, privateKey)),
    );

    post({
      type: "transfer-started",
      transferId,
      chunks,
      chunkSize,
      filename: metadata.name,
      size,
    });

    const result: Uint8Array<ArrayBuffer>[] = [];
    let acc = 0;

    for (let i = 0; i < chunks; i++) {
      let received = 0;

      const { url } = await rpc({
        type: "get-file-chunk",
        chunkIndex: i,
        fileId,
        transferId,
      });

      post({
        type: "chunk-started",
        chunkIndex: i,
        transferId,
      });

      const f = await axios.get(url, {
        responseType: "blob",
        onDownloadProgress(event) {
          received = event.loaded;

          post({
            type: "chunk-progress",
            sent: event.loaded,
            chunkIndex: i,
            transferId,
          });
          post({
            type: "transfer-progress",
            sent: acc + received,
            transferId,
          });
        },
      });
      acc += received;

      const buf = f.data as Blob;

      const plain = aeadCompositeDecrypt(await buf.bytes(), fek);

      result.push(new Uint8Array(plain));
      post({
        type: "chunk-complete",
        chunkIndex: i,
        transferId,
      });
    }

    post({
      type: "transfer-complete",
      transferId,
    });

    const blob = new Blob(result);

    await rpc({
      type: "download",
      blob,
      filename: metadata.name,
      transferId,
    });
  } catch (e) {
    let message = "unknown error";

    if (e instanceof AxiosError) {
      message = e.response?.data?.error ?? e.response?.statusText;
    } else if (e instanceof Error) {
      message = e.message;
    }

    post({
      type: "transfer-error",
      transferId,
      error: message,
    });
  }
}

async function downloadShare(
  shareId: number,
  pubKey: Uint8Array,
  privKey: Uint8Array,
) {
  await sodium.ready;
  const transferId = crypto.randomUUID();

  try {
    post({
      type: "transfer-created",
      transferId,
      kind: "download-share",
      filename: "-",
      size: 0,
    });

    const { chunks, chunkSize, size, encryptedKey, encryptedMetadata } =
      await rpc({
        type: "get-share",
        shareId,
        transferId,
      });

    const fek = open(encryptedKey, pubKey, privKey);

    const metadata: FileMetadata = JSON.parse(
      to_string(
        open(encryptedMetadata, pubKey, privKey),
      ),
    );

    post({
      type: "transfer-started",
      transferId,
      chunks,
      chunkSize,
      filename: metadata.name,
      size,
    });

    const result: Uint8Array<ArrayBuffer>[] = [];
    let acc = 0;

    for (let i = 0; i < chunks; i++) {
      let received = 0;

      const { url } = await rpc({
        type: "get-share-chunk",
        chunkIndex: i,
        shareId,
        transferId,
      });

      post({
        type: "chunk-started",
        chunkIndex: i,
        transferId,
      });

      const f = await axios.get(url, {
        responseType: "blob",
        onDownloadProgress(event) {
          received = event.loaded;

          post({
            type: "chunk-progress",
            sent: event.loaded,
            chunkIndex: i,
            transferId,
          });
          post({
            type: "transfer-progress",
            sent: acc + received,
            transferId,
          });
        },
      });
      acc += received;

      const buf = f.data as Blob;

      const plain = aeadCompositeDecrypt(await buf.bytes(), fek);

      result.push(new Uint8Array(plain));
      post({
        type: "chunk-complete",
        chunkIndex: i,
        transferId,
      });
    }

    post({
      type: "transfer-complete",
      transferId,
    });

    const blob = new Blob(result);

    await rpc({
      type: "download",
      blob,
      filename: metadata.name,
      transferId,
    });
  } catch (e) {
    let message = "unknown error";

    if (e instanceof AxiosError) {
      message = e.response?.data?.error ?? e.response?.statusText;
    } else if (e instanceof Error) {
      message = e.message;
    }

    post({
      type: "transfer-error",
      transferId,
      error: message,
    });
  }
}

self.onmessage = async (e: MessageEvent<TransferCommand | WorkerResponse>) => {
  const params = e.data;

  switch (params.type) {
    case "enqueue-upload": {
      await upload(params.file, params.parentId, params.umk, params.publicKey);
      break;
    }
    case "enqueue-download": {
      await download(params.fileId, params.umk, params.publicKey, params.privateKey);
      break;
    }
    case "enqueue-download-share": {
      await downloadShare(params.shareId, params.publicKey, params.privateKey);
      break;
    }
  }
};
