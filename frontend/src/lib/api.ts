import { AxiosError, type AxiosResponse } from "axios";
import instance from "./axios"
import { toast } from "sonner";
import { createComposite, type AEADResult } from "./crypto";
import { from_base64, to_base64 } from "libsodium-wrappers-sumo";
import type { Wrapped } from "./types";

type Unserializable = Uint8Array;

type SerializedPrimitive<T> = T extends Unserializable ? string : T;

type SerializedArray<T extends unknown[]> = (
  T extends [] ? [] : (
    T extends [infer P, ...infer U] ? [Serialized<P>, ...SerializedArray<U>] : (
      T extends (infer Q)[] ? SerializedPrimitive<Q>[] : never
    )
  )
);

type SerializedObj<T> = {
  [K in keyof T]: Serialized<T[K]>
}

type Serialized<T> = T extends Unserializable ? string : (
  T extends object ? SerializedObj<T> : (
    T extends unknown[] ? SerializedArray<T> : SerializedPrimitive<T>
  )
);

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

type InitUploadResponse = Wrapped<{
  id: number,
  chunks: number,
  chunkSize: number
}>;

type InitRegistrationResponse = Wrapped<{
  message: string
}>

type FinishRegistrationPayload = {
  email: string,
  username: string,
  opaqueRecord: Uint8Array,
  publicKey: Uint8Array,
  privateKey: AEADResult,
  rootMetadata: AEADResult,
  kdf: {
    salt: Uint8Array,
    memoryCost: number,
    timeCost: number,
    parallelism: number
  },
}

type StartLoginResponse = {
  ke2: Uint8Array,
  loginStateID: string,
}

type FinishLoginResponse = {
  refreshToken: string,
  rootDirectory: number,
  kdf: {
    salt: Uint8Array,
    memoryCost: number,
    timeCost: number,
    parallelism: number,
  }
}

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

  async initUpload(size: number, metadata: AEADResult, parentId: number) {
    const response: AxiosResponse<InitUploadResponse> = await instance.post('/upload/init', {
      size,
      encryptedMetadata: to_base64(metadata.cipher),
      metadataNonce: to_base64(metadata.nonce),
      parentId
    });

    return response.data.data;
  },

  async completeUpload(id: number, key: AEADResult) {
    await instance.post(`/upload/${id}`, {
      encryptedKey: to_base64(createComposite(key.nonce, key.cipher))
    });
  },

  async completeChunk(id: number, index: number, size: number) {
    await instance.post(`/upload/${id}/chunks/${index + 1}/complete`, {
      size
    });
  },

  async startRegistration(username: string, blinded: number[]) {
    const response = await instance.post<InitRegistrationResponse>('/auth/register/start', {
      username,
      blinded: to_base64(new Uint8Array(blinded)),
    });

    return from_base64(response.data.data.message);
  },

  async completeRegistration(payload: FinishRegistrationPayload) {
    await instance.post('/auth/register/finish', {
      email: payload.email,
      username: payload.username,
      opaqueRecord: to_base64(payload.opaqueRecord),
      publicKey: to_base64(payload.publicKey),
      encryptedPrivateKey: to_base64(payload.privateKey.cipher),
      privateKeyNonce: to_base64(payload.privateKey.nonce),
      encryptedRootMetadata: to_base64(payload.rootMetadata.cipher),
      rootNonce: to_base64(payload.rootMetadata.nonce),
      kdf: {
        ...payload.kdf,
        salt: to_base64(payload.kdf.salt),
      }
    });
  },

  async startLogin(username: string, ke1: Uint8Array) {
    const response = await instance.post<Serialized<Wrapped<StartLoginResponse>>>('/auth/login/start', {
      username,
      ke1: to_base64(ke1)
    });

    const data = response.data.data;

    return {
      ke2: from_base64(data.ke2),
      loginStateID: data.loginStateID
    } as StartLoginResponse;
  },

  async finishLogin(ke3: Uint8Array, loginStateID: string) {
    const response = await instance.post<Serialized<Wrapped<FinishLoginResponse>>>('/auth/login/finish', {
      ke3: to_base64(ke3),
      loginStateID
    });

    const data = response.data.data;

    return {
      ...data,
      kdf: {
        ...data.kdf,
        salt: from_base64(data.kdf.salt)
      }
    } as FinishLoginResponse;
  }
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