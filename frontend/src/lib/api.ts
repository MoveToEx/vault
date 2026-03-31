import { AxiosError, type AxiosResponse } from "axios";
import instance from "./axios"
import { toast } from "sonner";
import type { AEADResult } from "./crypto";
import { to_base64 } from "libsodium-wrappers-sumo";
import type { Wrapped } from "./types";

type GetFileResponse = Wrapped<{
  chunks: number,
  chunkSize: number,
  size: number,
  encryptedKey: string,
  encryptedMetadata: string,
  metadataNonce: string,
}>;

type PresignResponse = Wrapped<{
  method: string,
  url: string,
  headers: Record<string, string[]>
}>;

const API = {
  async deleteFile(id: number) {
    await instance.delete(`/files/${id}`);
  },

  async newFolder(parent: number, metadata: AEADResult) {
    await instance.post('/files/folder', {
      parentId: parent,
      encryptedMetadata: to_base64(metadata.cipher),
      metadataNonce: to_base64(metadata.nonce),
    });
  },

  async getFile(id: number) {
    const response: AxiosResponse<GetFileResponse> = await instance.get(`/files/${id}`);

    return response.data.data;
  },

  async getChunk(id: number, index: number) {
    const response: AxiosResponse<PresignResponse> = await instance.get(`/files/${id}/${index + 1}`);

    return response.data.data;
  },

  async presignUploadChunk(id: number, index: number) {
    const response: AxiosResponse<PresignResponse> = await instance.post(`/upload/${id}/chunks/${index + 1}/init`);
    return response.data.data;
  },
};

const proxy = new Proxy(API, {
  get(target, prop) {
    const val = Reflect.get(target, prop);

    if (!val) {
      throw new TypeError();
    }

    if (typeof val === 'function') {
      return (...args: unknown[]) => {
        try {
          return val(...args);
        }
        catch (e) {
          if (e instanceof AxiosError) {
            toast.error(e.response?.data?.error ?? e.response?.statusText ?? 'unknown error');
          }
          else if (e instanceof Error) {
            toast.error(e.message);
          }
          else {
            toast.error('unknown error');
          }
        }
      }
    }
  }
});

export default proxy;