import type {
  RpcPayload,
  RpcResult,
  TransferCommand,
  TransferRpc,
  TransferMessage,
  WorkerResponse,
} from "@/shared/lib/types";
import axios from "axios";
import sodium, { from_base64, to_base64 } from "libsodium-wrappers";
import { formatError } from "@/shared/lib/utils";
import { Envelope, FileContent, PublicShare } from "@/shared/lib/crypto_wrappers";

async function rpc<K extends keyof TransferRpc>(
  type: K,
  payload: RpcPayload<TransferRpc, K>,
): Promise<RpcResult<TransferRpc, K>> {
  return new Promise((resolve, reject) => {
    const $id = crypto.randomUUID();

    const listener = (
      event: MessageEvent<TransferCommand | WorkerResponse>,
    ) => {
      if (
        "$id" in event.data &&
        event.data.type === type &&
        event.data.$id === $id
      ) {
        self.removeEventListener("message", listener);

        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data as RpcResult<TransferRpc, K>);
        }
      }
    };

    self.addEventListener("message", listener);

    self.postMessage({ type, ...payload, $id });
  });
}

function post<R extends TransferMessage>(message: R) {
  self.postMessage(message);
}

async function upload(file: File, parentId: number, signPriv: Uint8Array, kemPub: Uint8Array) {
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

    const fek = sodium.crypto_aead_xchacha20poly1305_ietf_keygen();

    const [kemCipher, envelope] = Envelope.encrypt({
      name: file.name,
      type: "file",
      key: to_base64(fek),
    }, signPriv, kemPub);

    const { id, chunks, chunkSize } = await rpc("init", {
      envelope,
      kemCipher,
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

      const { url } = await rpc("presign", {
        uploadId: id,
        chunkIndex: i,
        transferId,
      });

      const slice = file.slice(i * chunkSize, (i + 1) * chunkSize);

      const body = FileContent.encrypt(await slice.bytes(), fek);

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

      await rpc("chunk-ack", {
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

    await rpc("ack", {
      uploadId: id,
      transferId,
    });

    post({
      type: "transfer-complete",
      transferId,
    });
  } catch (e) {
    post({
      type: "transfer-error",
      transferId,
      error: formatError(e),
    });
  }
}

type Downloadable = {
  chunks: number;
  chunkSize: number;
  size: number;
  key: Uint8Array;
  name: string;
}

type Resolved = {
  url: string,
  headers: Record<string, string[]>,
}

type DownloadParams = {
  resolve: () => Promise<Downloadable>,
  resolveChunk: (index: number) => Promise<Resolved>,
  transferId: string,
}

async function download({ resolve, resolveChunk, transferId }: DownloadParams) {
  await sodium.ready;

  try {
    post({
      type: "transfer-created",
      transferId,
      kind: "download",
      filename: "-",
      size: 0,
    });

    const { chunks, chunkSize, size, key, name } = await resolve();

    post({
      type: "transfer-started",
      transferId,
      chunks,
      chunkSize,
      filename: name,
      size,
    });

    const result: Uint8Array<ArrayBuffer>[] = [];
    let acc = 0;

    for (let i = 0; i < chunks; i++) {
      let received = 0;

      const { url } = await resolveChunk(i);

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

      const plain = FileContent.decrypt(await buf.bytes(), key);

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

    await rpc("download", {
      blob,
      filename: name,
      transferId,
    });
  }
  catch (e) {
    post({
      type: "transfer-error",
      transferId,
      error: formatError(e),
    });
  }
}

self.onmessage = async (e: MessageEvent<TransferCommand | WorkerResponse>) => {
  const params = e.data;

  switch (params.type) {
    case "enqueue-upload": {
      await upload(params.file, params.parentId, params.signPriv, params.kemPub);
      break;
    }
    case "enqueue-download": {
      const transferId = crypto.randomUUID();

      await download({
        async resolve() {
          const file = await rpc("get-file", {
            fileId: params.fileId,
            transferId,
          });

          const result = Envelope.decrypt(
            file.envelope,
            file.kemCipher,
            params.signPub,
            params.kem.privateKey,
          );

          if (result.type !== 'file') throw new Error('unexpected target type');

          return {
            ...file,
            name: result.name,
            key: from_base64(result.key),
          };
        },
        async resolveChunk(index) {
          return await rpc("get-file-chunk", {
            chunkIndex: index,
            fileId: params.fileId,
            transferId,
          })
        },
        transferId
      })
      break;
    }

    case 'enqueue-download-public-share': {
      const transferId = crypto.randomUUID();

      await download({
        async resolve() {
          const { envelope, kemCipher, ...rest } = await rpc("get-public-share", {
            key: params.sid,
            transferId,
          });

          const metadata = PublicShare.decrypt(envelope, kemCipher, params.signPub, params.key);

          if (metadata.type !== 'file') throw new Error('unexpected item type');

          return {
            ...rest,
            name: metadata.name,
            key: from_base64(metadata.key),
          };
        },
        async resolveChunk(index) {
          return await rpc("resolve-public-share-chunk", {
            index,
            key: params.sid,
            transferId,
          })
        },
        transferId
      })
      break;
    }
    case "enqueue-download-share": {
      const transferId = crypto.randomUUID();

      await download({
        async resolve() {
          const file = await rpc("get-share", {
            shareId: params.shareId,
            transferId,
          });

          const result = Envelope.decrypt(file.envelope, file.kemCipher, params.signPub, params.kem.privateKey);

          if (result.type !== 'file') throw new Error('unexpected item type');
          
          return {
            ...file,
            name: result.name,
            key: from_base64(result.key),
          };
        },
        async resolveChunk(index) {
          return await rpc("get-share-chunk", {
            chunkIndex: index,
            shareId: params.shareId,
            transferId,
          })
        },
        transferId
      });
      break;
    }
  }
};
