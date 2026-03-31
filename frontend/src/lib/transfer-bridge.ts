import { store } from '@/stores'
import type { TransferCommand, TransferMessage, WithId, WorkerRequest, WorkerResponse } from './types';
import { chunkCompleted, chunkProgressUpdated, transferCanceled, transferCompleted, transferCreated, transferFailed, transferPaused, transferProgressUpdated, transferResumed, transferStarted } from '@/stores/transfer';
import { mutate } from './swr';
import { AxiosError } from 'axios';
import api from '@/lib/api';

class TransferBridge {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      new URL('@/workers/transfer.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.addEventListener('message', event => {
      this.onMessage(event.data);
    });
  }

  enqueueUpload(file: File, dir: number, umk: Uint8Array) {
    this.post({
      type: 'enqueue-upload',
      file,
      parentId: dir,
      umk,
    });
  }

  enqueueDownload(fileId: number, umk: Uint8Array) {
    this.post({
      type: 'enqueue-download',
      fileId,
      umk
    });
  }

  post(message: TransferCommand | WithId<WorkerResponse>) {
    this.worker.postMessage(message);
  }

  private async onMessage(message: TransferMessage | WithId<WorkerRequest>) {
    try {
      switch (message.type) {
        //#region Upload RPC
        case 'presign': {
          const { uploadId, chunkIndex, $id } = message;
          const response = await api.presignUploadChunk(uploadId, chunkIndex);

          const { url } = response;
          this.post({ type: 'presign', url, $id });

          break;
        }
        case 'init': {
          const { size, metadata, parentId, $id } = message;
          const { id, chunks, chunkSize } = await api.initUpload(size, metadata, parentId);
          this.post({ type: 'init', chunks, chunkSize, id, $id });
          break;
        }
        case 'ack': {
          const { encryptedKey, uploadId, $id } = message;
          await api.completeUpload(uploadId, encryptedKey);
          
          this.post({ type: 'ack', $id });
          break;
        }
        case 'chunk-ack': {
          const { chunkIndex, size, uploadId, $id } = message;
          await api.completeChunk(uploadId, chunkIndex, size);

          this.post({ type: 'chunk-ack', $id });
          break;
        }

        //#endregion

        //#region Download RPC
        case 'get': {
          const { fileId, $id } = message;

          const {
            chunks, chunkSize, size,
            encryptedKey, encryptedMetadata,
            metadataNonce
          } = await api.getFile(fileId);

          this.post({
            type: 'get',
            $id, chunks, chunkSize, encryptedKey,
            encryptedMetadata, metadataNonce, size
          });
          break;
        }
        case 'get-chunk': {
          const { fileId, chunkIndex, $id } = message;
          const { url } = await api.getChunk(fileId, chunkIndex);

          this.post({ type: 'get-chunk', url, $id });

          break;
        }
        case 'download': {
          const { blob, $id, filename } = message;
          const url = URL.createObjectURL(blob);

          const elem = document.createElement('a');
          elem.href = url;
          elem.download = filename;

          document.body.appendChild(elem);
          elem.click();

          document.body.removeChild(elem);
          URL.revokeObjectURL(url);

          this.post({ type: 'download', $id });
          break;
        }
        //#endregion

        //#region Messages
        case 'transfer-created': {
          store.dispatch(transferCreated(message));
          break;
        }
        case 'transfer-started': {
          store.dispatch(transferStarted(message));
          break;
        }
        case 'transfer-complete': {
          mutate('file')
          store.dispatch(transferCompleted(message));
          break;
        }
        case 'chunk-started': {
          store.dispatch(chunkProgressUpdated({
            ...message,
            sent: 0,
          }));
          break;
        }
        case 'chunk-progress': {
          store.dispatch(chunkProgressUpdated(message));
          break;
        }
        case 'chunk-complete': {
          store.dispatch(chunkCompleted(message));
          break;
        }

        case 'transfer-progress': {
          store.dispatch(transferProgressUpdated(message));
          break;
        }

        case 'transfer-paused': {
          store.dispatch(transferPaused(message));
          break;
        }

        case 'transfer-resumed': {
          store.dispatch(transferResumed(message));
          break;
        }

        case 'transfer-canceled': {
          store.dispatch(transferCanceled(message));
          break;
        }

        case 'transfer-error': {
          store.dispatch(transferFailed(message));
          break;
        }
          
        //#endregion
      }
    }
    catch (e) {
      if (e instanceof AxiosError) {
        store.dispatch(
          transferFailed({
            transferId: message.transferId,
            error: e.response?.data?.error ?? e.response?.statusText ?? 'Fail'
          })
        )
      }
      else if (e instanceof Error) {
        store.dispatch(
          transferFailed({
            transferId: message.transferId,
            error: e.message
          })
        )
      }
    }
  }
}

export const transferBridge = new TransferBridge();