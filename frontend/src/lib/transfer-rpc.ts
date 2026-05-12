import api from "@/lib/api";

export const transferRpcHandlers = {
  "get-user-pk": async ({ username }: {
    username: string;
    transferId: string;
  }) => {
    const response = await api.getUser(username);
    return { signPub: response.sgnPub };
  },
  presign: async ({ uploadId, chunkIndex }: {
    uploadId: number;
    chunkIndex: number;
    transferId: string;
  }) => {
    const response = await api.presignUploadChunk(uploadId, chunkIndex);
    return { url: response.url };
  },
  init: async ({ size, envelope, kemCipher, parentId }: {
    parentId: number;
    size: number;
    transferId: string;
    envelope: Uint8Array;
    kemCipher: Uint8Array;
  }) => {
    return await api.initUpload(size, envelope, kemCipher, parentId);
  },
  "chunk-ack": async ({ uploadId, chunkIndex, size }: {
    uploadId: number;
    chunkIndex: number;
    size: number;
    transferId: string;
  }) => {
    await api.completeChunk(uploadId, chunkIndex, size);
  },
  ack: async ({ uploadId }: {
    uploadId: number;
    transferId: string;
  }) => {
    await api.completeUpload(uploadId);
  },
  "get-file": async ({ fileId }: {
    fileId: number;
    transferId: string;
  }) => {
    return await api.getFile(fileId);
  },
  "get-file-chunk": async ({ fileId, chunkIndex }: {
    fileId: number;
    chunkIndex: number;
    transferId: string;
  }) => {
    return await api.getChunk(fileId, chunkIndex);
  },
  "get-public-share": async ({ key }: {
    key: string;
    transferId: string;
  }) => {
    return await api.getPublicShare(key);
  },
  "resolve-public-share-chunk": async ({ key, index }: {
    key: string;
    index: number;
    transferId: string;
  }) => {
    return await api.resolvePublicShareChunk(key, index);
  },
  "get-share": async ({ shareId }: {
    shareId: number;
    transferId: string;
  }) => {
    return await api.getShare(shareId);
  },
  "get-share-chunk": async ({ shareId, chunkIndex }: {
    shareId: number;
    chunkIndex: number;
    transferId: string;
  }) => {
    return await api.getShareChunk(shareId, chunkIndex);
  },
  download: async ({ blob, filename }: {
    blob: Blob;
    filename: string;
    transferId: string;
  }) => {
    const url = URL.createObjectURL(blob);

    const elem = document.createElement("a");
    elem.href = url;
    elem.download = filename;

    document.body.appendChild(elem);
    elem.click();

    document.body.removeChild(elem);
    URL.revokeObjectURL(url);
  },
};

export type TransferRpc = typeof transferRpcHandlers;
