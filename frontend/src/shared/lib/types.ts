import type { transferRpcHandlers } from "@/features/transfer/lib/transfer-rpc";

/** Tags for SWR cache keys and `mutate()` invalidation (see `shared/lib/swr.ts`). */
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

type RpcSpec = Record<string, (payload: never) => unknown>;

export type RpcPayload<T extends RpcSpec, K extends keyof T> =
  Parameters<T[K]>[0];

export type RpcResult<T extends RpcSpec, K extends keyof T> =
  T[K] extends (payload: never) => infer R ? Awaited<R> : never;

type RpcResponseBody<T extends RpcSpec, K extends keyof T> =
  RpcResult<T, K> extends void ? unknown : RpcResult<T, K>;

export type RpcRequest<T extends RpcSpec, K extends keyof T = keyof T> = {
  [P in K]: {
    type: P;
    $id: string;
  } & RpcPayload<T, P>;
}[K];

export type RpcResponse<T extends RpcSpec, K extends keyof T = keyof T> = {
  [P in K]:
    | ({
      type: P;
      $id: string;
      error?: undefined;
    } & RpcResponseBody<T, P>)
    | {
      type: P;
      $id: string;
      error: string;
    };
}[K];

export type TransferRpc = typeof transferRpcHandlers;

export type WorkerRequest = RpcRequest<TransferRpc>;

export type WorkerResponse = RpcResponse<TransferRpc>;

declare module "axios" {
  export interface AxiosRequestConfig {
    _retry?: boolean;
  }
}
