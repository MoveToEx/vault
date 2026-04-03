import type { AEADResult } from "./crypto";

export type Wrapped<T> = {
  error?: string,
  data: T,
};

export type KDFParameters = {
  salt: Uint8Array,
  memoryCost: number,
  timeCost: number,
  parallelism: number,
}

export type FileMetadata = {
  name: string,
  mime: string,
  type: 'file'
}

export type FolderMetadata = {
  name: string,
  type: 'folder'
}

export type Metadata = FileMetadata | FolderMetadata;

export type TransferMessage = (
  | {
    type: 'transfer-created';
    kind: 'upload' | 'download' | 'download-share';
    filename: string;
    size: number;
  }
  | {
    type: 'transfer-started';
    filename?: string;
    size?: number;
    chunks: number;
    chunkSize: number;
  }
  | {
    type: 'chunk-started';
    chunkIndex: number;
  }
  | {
    type: 'chunk-progress';
    chunkIndex: number;
    sent: number
  }
  | {
    type: 'chunk-complete';
    chunkIndex: number;
  }
  | {
    type: 'transfer-progress';
    sent: number;
  }
  | {
    type: 'transfer-complete';
  }
  | {
    type: 'transfer-error';
    error: string;
  }
  | {
    type: 'transfer-paused';
  }
  | {
    type: 'transfer-resumed';
  }
  | {
    type: 'transfer-canceled';
  }) & {
    transferId: string,
  };

export type TransferCommand =
  {
    type: 'enqueue-upload';
    file: File;
    umk: Uint8Array;
    parentId: number;
  }
  | { 
    type: 'enqueue-download';
    fileId: number;
    umk: Uint8Array;
  }
  | {
    type: 'enqueue-download-share';
    shareId: number;
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  }
  | {
    type: 'pause-transfer';
    transferId: string;
  }
  | {
    type: 'resume-transfer';
    transferId: string;
  }
  | {
    type: 'cancel-transfer';
    transferId: string;
  };


// Worker RPC

export type WithId<T> = {
  $id: string
} & T;

export type WorkerRequest = ({
  type: 'presign'
  uploadId: number,
  chunkIndex: number,
} | {
  type: 'init',
  metadata: AEADResult,
  parentId: number,
  size: number,
} | {
  type: 'chunk-ack',
  uploadId: number,
  chunkIndex: number,
  size: number,
} | {
  type: 'ack',
  uploadId: number,
  encryptedKey: AEADResult,
} | {
  type: 'get-file',
  fileId: number
} | {
  type: 'get-file-chunk',
  fileId: number,
  chunkIndex: number
} | {
  type: 'get-share',
  shareId: number
} | {
  type: 'get-share-chunk',
  shareId: number,
  chunkIndex: number,
} | {
  type: 'download',
  blob: Blob,
  filename: string,
}) & {
  transferId: string,
}

export type WorkerResponse = ({
  type: 'presign',
  url: string,
} | {
  type: 'init',
  id: number,
  chunks: number,
  chunkSize: number,
} | {
  type: 'chunk-ack'
} | {
  type: 'ack'
} | {
  type: 'get-file',
  chunks: number,
  chunkSize: number,
  size: number,
  encryptedKey: string,
  encryptedMetadata: string,
  metadataNonce: string,
} | {
  type: 'get-share'
  chunks: number,
  chunkSize: number,
  size: number,
  receiverId: number,
  senderId: number,
  encryptedKey: Uint8Array,
  encryptedMetadata: Uint8Array,
} | {
  type: 'get-share-chunk',
  url: string,
} | {
  type: 'get-file-chunk',
  url: string,
} | {
  type: 'download'
}) & {
  error?: string,
}

declare module "axios" {
  export interface AxiosRequestConfig {
    _retry?: boolean
  }
}