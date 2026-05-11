/** Tags for SWR cache keys and `mutate()` invalidation (see `lib/swr.ts`). */
export type SwrTag = "file" | "user" | "self" | "share" | "log" | "admin" | "public-share";

export type Unserializable = Uint8Array;

type SerializedPrimitive<T> = T extends Unserializable ? string : T;

type SerializedArray<T extends unknown[]> = T extends []
  ? []
  : T extends [infer P, ...infer U]
  ? [Serialized<P>, ...SerializedArray<U>]
  : T extends (infer Q)[]
  ? SerializedPrimitive<Q>[]
  : never;

type SerializedObj<T> = {
  [K in keyof T]: Serialized<T[K]>;
};

export type Serialized<T> = T extends Unserializable
  ? string
  : T extends object
  ? SerializedObj<T>
  : T extends unknown[]
  ? SerializedArray<T>
  : SerializedPrimitive<T>;

export type Wrapped<T> = {
  error?: string;
  data: T;
};

export type Keypair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

export type EncryptedEnvelope = {
  envelope: Uint8Array,
  kemCipher: Uint8Array,
};

export type KDFParameters = {
  salt: Uint8Array;
  memoryCost: number;
  timeCost: number;
};

export type Metadata = FileMetadata | FolderMetadata;

export type FileMetadata = {
  type: 'file',
  name: string,
  key: string,  // base64
};

export type FolderMetadata = {
  type: 'folder',
  name: string,
};

export type TransferMessage = (
  | {
    type: "transfer-created";
    kind: "upload" | "download" | "download-share";
    filename: string;
    size: number;
  }
  | {
    type: "transfer-started";
    filename?: string;
    size?: number;
    chunks: number;
    chunkSize: number;
  }
  | {
    type: "chunk-started";
    chunkIndex: number;
  }
  | {
    type: "chunk-progress";
    chunkIndex: number;
    sent: number;
  }
  | {
    type: "chunk-complete";
    chunkIndex: number;
  }
  | {
    type: "transfer-progress";
    sent: number;
  }
  | {
    type: "transfer-complete";
  }
  | {
    type: "transfer-error";
    error: string;
  }
  | {
    type: "transfer-paused";
  }
  | {
    type: "transfer-resumed";
  }
  | {
    type: "transfer-canceled";
  }
) & {
  transferId: string;
};

export type TransferCommand =
  | {
    type: "enqueue-upload";
    file: File;
    signPriv: Uint8Array;
    kemPub: Uint8Array;
    parentId: number;
  }
  | {
    type: "enqueue-download";
    fileId: number;
    signPub: Uint8Array;
    kem: Keypair;
  }
  | {
    type: "enqueue-download-share";
    shareId: number;
    signPub: Uint8Array;
    kem: Keypair;
  }
  | {
    type: 'enqueue-download-public-share';
    sid: string;
    signPub: Uint8Array;
    key: string;
  }
  | {
    type: "pause-transfer";
    transferId: string;
  }
  | {
    type: "resume-transfer";
    transferId: string;
  }
  | {
    type: "cancel-transfer";
    transferId: string;
  };

// Worker RPC

export type WithId<T> = {
  $id: string;
} & T;

export type WorkerRequest = (
  | {
    type: "presign";
    uploadId: number;
    chunkIndex: number;
  }
  | {
    type: "get-user-pk";
    username: string;
  }
  | {
    type: "init";
    parentId: number;
    size: number;
  } & EncryptedEnvelope
  | {
    type: "chunk-ack";
    uploadId: number;
    chunkIndex: number;
    size: number;
  }
  | {
    type: "ack";
    uploadId: number;
  }
  | {
    type: "get-file";
    fileId: number;
  }
  | {
    type: "get-file-chunk";
    fileId: number;
    chunkIndex: number;
  }
  | {
    type: 'get-public-share',
    key: string,
  }
  | {
    type: 'resolve-public-share-chunk',
    key: string,
    index: number,
  }
  | {
    type: "get-share";
    shareId: number;
  }
  | {
    type: "get-share-chunk";
    shareId: number;
    chunkIndex: number;
  }
  | {
    type: "download";
    blob: Blob;
    filename: string;
  }
) & {
  transferId: string;
};

export type WorkerResponse = (
  | {
    type: "presign";
    url: string;
  }
  | {
    type: "init";
    id: number;
    chunks: number;
    chunkSize: number;
  }
  | {
    type: "get-user-pk";
    signPub: Uint8Array;
  }
  | {
    type: "chunk-ack";
  }
  | {
    type: "ack";
  }
  | {
    type: "get-file";
    chunks: number;
    chunkSize: number;
    size: number;
  } & EncryptedEnvelope
  | {
    type: "get-share";
    chunks: number;
    chunkSize: number;
    size: number;
    receiverId: number;
    senderId: number;
  } & EncryptedEnvelope
  | {
    type: "get-share-chunk";
    url: string;
    headers: Record<string, string[]>
  }
  | {
    type: 'get-public-share',
    chunks: number;
    chunkSize: number;
    size: number;
    owner: string;
  } & EncryptedEnvelope
  | {
    type: 'resolve-public-share-chunk',
    url: string;
    headers: Record<string, string[]>
  }
  | {
    type: "get-file-chunk";
    url: string;
    headers: Record<string, string[]>
  }
  | {
    type: "download";
  }
) & {
  error?: string;
};

declare module "axios" {
  export interface AxiosRequestConfig {
    _retry?: boolean;
  }
}
