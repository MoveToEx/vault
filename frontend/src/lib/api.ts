import axios, { type AxiosResponse } from "axios";
import instance from "./axios";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? "http://localhost:8000/";
import { from_base64, to_base64 } from "libsodium-wrappers-sumo";
import type { KDFParameters, Wrapped } from "./types";

type Unserializable = Uint8Array;

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

type Serialized<T> = T extends Unserializable
  ? string
  : T extends object
    ? SerializedObj<T>
    : T extends unknown[]
      ? SerializedArray<T>
      : SerializedPrimitive<T>;

type RefreshResponse = Wrapped<{
  accessKey: string;
  refreshKey: string;
}>;

type GetFileResponse = Wrapped<{
  chunks: number;
  chunkSize: number;
  size: number;
  encryptedKey: string; // [ ] string -> Uint8Array
  encryptedMetadata: string;
}>;

type PresignResponse = Wrapped<{
  method: string;
  url: string;
  headers: Record<string, string[]>;
}>;

type InitUploadResponse = Wrapped<{
  id: number;
  chunks: number;
  chunkSize: number;
}>;

type InitRegistrationResponse = Wrapped<{
  message: string;
}>;

type FinishRegistrationPayload = {
  email: string;
  username: string;
  opaqueRecord: Uint8Array;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  rootMetadata: Uint8Array;
  kdf: KDFParameters;
};

type StartLoginResponse = {
  ke2: Uint8Array;
  loginStateID: string;
};

type FinishLoginResponse = {
  refreshToken: string;
  encryptedPrivateKey: Uint8Array;
  publicKey: Uint8Array;
  kdf: KDFParameters;
};

type CreateSharePayload = {
  receiver: string;
  fileId: number;
  encryptedMetadata: Uint8Array;
  encryptedKey: Uint8Array;
};

type NewShareResponse = {
  id: number;
};

type GetUserResponse = {
  id: number;
  username: string;
  publicKey: Uint8Array;
};

type GetShareResposne = {
  chunks: number;
  chunkSize: number;
  size: number;
  senderId: number;
  receiverId: number;

  encryptedKey: Uint8Array;
  encryptedMetadata: Uint8Array;
};

const api = {
  async getPublicSiteConfig() {
    const response = await axios.get<Wrapped<{ registrationOpen: boolean }>>(
      `${BASE_URL}public/site-config`,
    );
    return response.data.data;
  },

  async refresh(refreshToken: string) {
    const response = await axios.post<RefreshResponse>("/auth/refresh", {
      refreshToken,
    });

    return response.data.data;
  },
  async deleteFile(id: number) {
    await instance.delete(`/files/${id}`);
  },
  async deleteFolder(id: number) {
    await instance.delete(`/folder/${id}`);
  },

  async renameFile(id: number, metadata: Uint8Array) {
    await instance.post(`/files/${id}`, {
      encryptedMetadata: to_base64(metadata),
    });
  },

  async renameFolder(id: number, metadata: Uint8Array) {
    await instance.put(`/folder/${id}`, {
      encryptedMetadata: to_base64(metadata),
    });
  },

  async newFolder(parent: number, metadata: Uint8Array) {
    await instance.post("/folder", {
      parentId: parent,
      encryptedMetadata: to_base64(metadata),
    });
  },

  async getFile(id: number) {
    const response: AxiosResponse<GetFileResponse> = await instance.get(
      `/files/${id}`,
    );

    return response.data.data;
  },

  async getChunk(id: number, index: number) {
    const response: AxiosResponse<PresignResponse> = await instance.get(
      `/files/${id}/${index + 1}`,
    );

    return response.data.data;
  },

  async presignUploadChunk(id: number, index: number) {
    const response: AxiosResponse<PresignResponse> = await instance.post(
      `/upload/${id}/${index + 1}/init`,
    );
    return response.data.data;
  },

  async initUpload(size: number, metadata: Uint8Array, parentId: number) {
    const response: AxiosResponse<InitUploadResponse> = await instance.post(
      "/upload/init",
      {
        size,
        encryptedMetadata: to_base64(metadata),
        parentId,
      },
    );

    return response.data.data;
  },

  async completeUpload(id: number, encryptedKey: Uint8Array) {
    await instance.post(`/upload/${id}`, {
      encryptedKey: to_base64(encryptedKey),
    });
  },

  async completeChunk(id: number, index: number, size: number) {
    await instance.post(`/upload/${id}/${index + 1}/complete`, {
      size,
    });
  },

  async startRegistration(username: string, blinded: number[]) {
    const response = await instance.post<InitRegistrationResponse>(
      "/auth/register/start",
      {
        username,
        blinded: to_base64(new Uint8Array(blinded)),
      },
    );

    return from_base64(response.data.data.message);
  },

  async completeRegistration(payload: FinishRegistrationPayload) {
    await instance.post("/auth/register/finish", {
      email: payload.email,
      username: payload.username,
      opaqueRecord: to_base64(payload.opaqueRecord),
      publicKey: to_base64(payload.publicKey),
      encryptedPrivateKey: to_base64(payload.privateKey),
      encryptedRootMetadata: to_base64(payload.rootMetadata),
      kdf: {
        ...payload.kdf,
        salt: to_base64(payload.kdf.salt),
      },
    });
  },

  async startLogin(username: string, ke1: Uint8Array) {
    const response = await instance.post<
      Serialized<Wrapped<StartLoginResponse>>
    >("/auth/login/start", {
      username,
      ke1: to_base64(ke1),
    });

    const data = response.data.data;

    return {
      ke2: from_base64(data.ke2),
      loginStateID: data.loginStateID,
    } as StartLoginResponse;
  },

  async finishLogin(ke3: Uint8Array, loginStateID: string) {
    const response = await instance.post<
      Serialized<Wrapped<FinishLoginResponse>>
    >("/auth/login/finish", {
      ke3: to_base64(ke3),
      loginStateID,
    });

    const data = response.data.data;

    return {
      ...data,
      encryptedPrivateKey: from_base64(data.encryptedPrivateKey),
      publicKey: from_base64(data.publicKey),
      kdf: {
        ...data.kdf,
        salt: from_base64(data.kdf.salt),
      },
    } as FinishLoginResponse;
  },

  async createShare({
    encryptedKey,
    encryptedMetadata,
    fileId,
    receiver,
  }: CreateSharePayload) {
    const response = await instance.post<Serialized<Wrapped<NewShareResponse>>>(
      "/share",
      {
        fileId,
        receiver,
        encryptedKey: to_base64(encryptedKey),
        encryptedMetadata: to_base64(encryptedMetadata),
      },
    );

    return response.data.data;
  },

  async getUser(username: string) {
    const response = await instance.get<Serialized<Wrapped<GetUserResponse>>>(
      `/user/${username}`,
    );

    const data = response.data.data;

    return {
      ...data,
      publicKey: from_base64(data.publicKey),
    } as GetUserResponse;
  },

  async getShare(shareId: number) {
    const response = await instance.get<Serialized<Wrapped<GetShareResposne>>>(
      `/share/${shareId}`,
    );

    const data = response.data.data;

    return {
      ...data,
      encryptedKey: from_base64(data.encryptedKey),
      encryptedMetadata: from_base64(data.encryptedMetadata),
    } as GetShareResposne;
  },

  async getShareChunk(shareId: number, index: number) {
    const response = await instance.get<PresignResponse>(
      `/share/${shareId}/${index + 1}`,
    );

    return response.data.data;
  },

  async revokeShare(shareId: number) {
    await instance.delete(`/share/${shareId}`);
  },

  async getAuditLogs(
    limit: number,
    offset: number,
    filters?: { level?: string; from?: string; to?: string },
  ) {
    const params: Record<string, string | number> = { limit, offset };
    if (filters?.level) params.level = filters.level;
    if (filters?.from) params.from = filters.from;
    if (filters?.to) params.to = filters.to;

    const response = await instance.get<
      Wrapped<{
        total: number;
        items: Array<{
          id: number;
          level: string;
          message: string;
          encryptedMetadata?: string;
          createdAt: string;
        }>;
      }>
    >("/audit/logs", { params });

    return response.data.data;
  },

  async getAdminStats() {
    const response = await instance.get<
      Wrapped<{
        userCount: number;
        fileCount: number;
        totalStoredBytes: number;
        activeUploadSessions: number;
      }>
    >("/admin/stats");
    return response.data.data;
  },

  async getAdminSiteConfig() {
    const response = await instance.get<
      Wrapped<{
        uploadExpirySeconds: number;
        registrationOpen: boolean;
        defaultUserCapacityBytes: number;
      }>
    >("/admin/site-config");
    return response.data.data;
  },

  async patchAdminSiteConfig(payload: {
    uploadExpirySeconds: number;
    registrationOpen: boolean;
    defaultUserCapacityBytes: number;
  }) {
    await instance.patch("/admin/site-config", payload);
  },

  async listAdminUsers(limit: number, offset: number) {
    const response = await instance.get<
      Wrapped<{
        total: number;
        items: Array<{
          id: number;
          email: string;
          username: string;
          permission: number;
          capacity: number;
          isActive: boolean;
          isLocked: boolean;
          createdAt: string;
          lastLoginAt: string;
        }>;
      }>
    >("/admin/users", { params: { limit, offset } });
    return response.data.data;
  },

  async patchAdminUserCapacity(userId: number, capacity: number) {
    await instance.patch(`/admin/users/${userId}/capacity`, { capacity });
  },

  async patchAdminUserActive(userId: number, isActive: boolean) {
    await instance.patch(`/admin/users/${userId}/active`, { isActive });
  },

  async listSessions() {
    const refresh = JSON.parse(
      localStorage.getItem("vault-refresh-token") ?? '""',
    ) as string;
    const response = await instance.get<
      Wrapped<
        Array<{
          id: number;
          createdAt: string;
          expiresAt: string;
          lastUsedAt?: string;
          current: boolean;
        }>
      >
    >("/me/sessions", {
      headers: refresh ? { "X-Vault-Refresh-Token": refresh } : {},
    });
    return response.data.data;
  },

  async revokeSession(sessionId: number) {
    await instance.delete(`/me/sessions/${sessionId}`);
  },

  async passwordChangeStart(blinded: Uint8Array) {
    const response = await instance.post<InitRegistrationResponse>(
      "/me/password/start",
      {
        blinded: to_base64(blinded),
      },
    );

    return from_base64(response.data.data.message);
  },

  async passwordChangeFinish(payload: {
    opaqueRecord: Uint8Array;
    privateKey: Uint8Array;
    kdf: KDFParameters;
  }) {
    await instance.post("/me/password/finish", {
      opaqueRecord: to_base64(payload.opaqueRecord),
      encryptedPrivateKey: to_base64(payload.privateKey),
      kdf: {
        ...payload.kdf,
        salt: to_base64(payload.kdf.salt),
      },
    });
  },

  async deleteAccount(confirmUsername: string) {
    await instance.delete("/me/account", {
      data: { confirmUsername },
    });
  },
};

export default api;
