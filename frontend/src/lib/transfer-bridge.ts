import { store } from "@/stores";
import type {
  Keypair,
  TransferCommand,
  TransferMessage,
  WorkerRequest,
  WorkerResponse,
} from "./types";
import {
  chunkCompleted,
  chunkProgressUpdated,
  transferCanceled,
  transferCompleted,
  transferCreated,
  transferFailed,
  transferPaused,
  transferProgressUpdated,
  transferResumed,
  transferStarted,
} from "@/stores/transfer";
import { mutate } from "./swr";
import { formatError } from "./utils";
import { transferRpcHandlers } from "@/lib/transfer-rpc";

class TransferBridge {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL("@/workers/transfer.worker.ts", import.meta.url),
      { type: "module" },
    );

    this.worker.addEventListener("message", (event) => {
      this.onMessage(event.data);
    });
  }

  enqueueUpload(file: File, dir: number, signPriv: Uint8Array, kemPub: Uint8Array) {
    this.post({
      type: "enqueue-upload",
      file,
      parentId: dir,
      signPriv,
      kemPub,
    });
  }

  enqueueDownload(fileId: number, signPub: Uint8Array, kem: Keypair) {
    this.post({
      type: "enqueue-download",
      fileId,
      signPub,
      kem
    });
  }

  enqueueDownloadShare(
    shareId: number,
    signPub: Uint8Array,
    kem: Keypair
  ) {
    this.post({
      type: "enqueue-download-share",
      shareId,
      signPub,
      kem
    });
  }

  enqueueDownloadPublicShare(
    sid: string,
    key: string,
    signPub: Uint8Array,
  ) {
    this.post({
      type: 'enqueue-download-public-share',
      sid,
      key,
      signPub,
    })
  }

  post(message: TransferCommand | WorkerResponse) {
    this.worker.postMessage(message);
  }

  private postRpcResult(message: WorkerRequest, result: unknown) {
    if (result === undefined) {
      this.post({ type: message.type, $id: message.$id } as WorkerResponse);
      return;
    }

    const payload =
      result !== null && typeof result === "object" ? result : {};

    this.post({
      type: message.type,
      $id: message.$id,
      ...payload,
    } as WorkerResponse);
  }

  private async onMessage(message: TransferMessage | WorkerRequest) {
    try {
      if ("$id" in message) {
        const result = await transferRpcHandlers[message.type](message as never);

        this.postRpcResult(message, result);
        return;
      }

      switch (message.type) {
        case "transfer-created": {
          store.dispatch(transferCreated(message));
          break;
        }
        case "transfer-started": {
          store.dispatch(transferStarted(message));
          break;
        }
        case "transfer-complete": {
          mutate("file");
          store.dispatch(transferCompleted(message));
          break;
        }
        case "chunk-started": {
          store.dispatch(
            chunkProgressUpdated({
              ...message,
              sent: 0,
            }),
          );
          break;
        }
        case "chunk-progress": {
          store.dispatch(chunkProgressUpdated(message));
          break;
        }
        case "chunk-complete": {
          store.dispatch(chunkCompleted(message));
          break;
        }

        case "transfer-progress": {
          store.dispatch(transferProgressUpdated(message));
          break;
        }

        case "transfer-paused": {
          store.dispatch(transferPaused(message));
          break;
        }

        case "transfer-resumed": {
          store.dispatch(transferResumed(message));
          break;
        }

        case "transfer-canceled": {
          store.dispatch(transferCanceled(message));
          break;
        }

        case "transfer-error": {
          store.dispatch(transferFailed(message));
          break;
        }
      }
    } catch (e) {
      const error = formatError(e);

      store.dispatch(
        transferFailed({
          transferId: message.transferId,
          error,
        }),
      );

      if ("$id" in message) {
        this.post({
          type: message.type,
          $id: message.$id,
          error,
        } as WorkerResponse);
      }
    }
  }
}

export const transferBridge = new TransferBridge();
