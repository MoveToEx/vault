import { type AxiosResponse } from "axios";
import instance from "./axios";
import { base64_variants, from_base64, to_base64 } from "libsodium-wrappers";
import type { EncryptedEnvelope, KDFParameters, Keypair, Serialized, Wrapped } from "@/shared/lib/types";

type GetFileResponse = {
  chunks: number;
  chunkSize: number;
  size: number;
} & EncryptedEnvelope;

type GetFilesResponse = {
  files: ({
    id: number,
    createdAt: string,
    size: number,
  } & EncryptedEnvelope)[],
  folders: ({
    id: number,
    createdAt: string,
  } & EncryptedEnvelope)[]
}

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
  kem: Keypair;
  sgn: Keypair;
  root: EncryptedEnvelope;
  kdf: KDFParameters;
};

type StartLoginResponse = {
  ke2: Uint8Array;
  loginStateID: string;
};

type FinishLoginResponse = {
  refreshToken: string;
  kemPub: Uint8Array;
  kemPri: Uint8Array;
  sgnPub: Uint8Array;
  sgnPri: Uint8Array;
  kdf: KDFParameters;
};

type PasswordChangeFinishPayload = {
  opaqueRecord: Uint8Array;
  kemPri: Uint8Array;
  sgnPri: Uint8Array;
  kdf: KDFParameters;
};

type CreatePublicSharePayload = {
  fileId: number;
} & EncryptedEnvelope;

type GetPublicShareResponse = {
  key: string,
  owner: string,
  size: number,
  chunks: number,
  chunkSize: number,
  createdAt: string,
  sgnPub: Uint8Array,
} & EncryptedEnvelope;

type GetSharesResponse = ({
  id: number;
  senderId: number;
  receiverId: number;
  sender: string;
  sgnPub: Uint8Array;
  createdAt: string;
  expiresAt: string;
} & EncryptedEnvelope)[];

type CreateSharePayload = {
  receiver: string;
  fileId: number;
} & EncryptedEnvelope;

type NewShareResponse = {
  id: number;
};

type NewPublicShareResponse = {
  key: string;
}

type GetUserResponse = {
  id: number;
  username: string;
  kemPub: Uint8Array;
  sgnPub: Uint8Array;
};

type GetShareResposne = {
  chunks: number;
  chunkSize: number;
  size: number;
  senderId: number;
  receiverId: number;
} & EncryptedEnvelope;

type GetPublicSharesResponse = ({
  key: string,
  createdAt: string,
  expiresAt: string,
} & EncryptedEnvelope)[];

type GetMySharesResponse = ({
  id: number;
  senderId: number;
  receiverId: number;
  receiver: string;
  createdAt: string;
  expiresAt: string;
} & EncryptedEnvelope)[];

const api = {
  async deleteFile(id: number) {
    await instance.delete(`/files/${id}`);
  },
  async deleteFolder(id: number) {
    await instance.delete(`/folder/${id}`);
  },

  async renameFile(id: number, envelope: Uint8Array) {
    await instance.post(`/files/${id}`, {
      envelope: to_base64(envelope),
    });
  },

  async renameFolder(id: number, envelope: Uint8Array) {
    await instance.put(`/folder/${id}`, {
      envelope: to_base64(envelope),
    });
  },

  async moveFile(id: number, destinationFolderId: number) {
    await instance.patch(`/files/${id}/move`, { destinationFolderId });
  },

  async moveFolder(id: number, destinationFolderId: number) {
    await instance.patch(`/folder/${id}/move`, { destinationFolderId });
  },

  async newFolder(parent: number, { envelope, kemCipher }: EncryptedEnvelope) {
    await instance.post("/folder", {
      parentId: parent,
      envelope: to_base64(envelope),
      kemCipher: to_base64(kemCipher),
    });
  },

  async getFile(id: number) {
    const response: AxiosResponse<Serialized<Wrapped<GetFileResponse>>> = await instance.get(
      `/files/${id}`,
    );

    return {
      ...response.data.data,
      envelope: from_base64(response.data.data.envelope),
      kemCipher: from_base64(response.data.data.kemCipher),
    };
  },

  async getFiles(folder: number) {
    const response: AxiosResponse<Serialized<Wrapped<GetFilesResponse>>> = await instance.get(
      `/files`,
      {
        params: {
          dir: folder
        }
      }
    );

    const data = response.data.data;

    return {
      files: data.files.map(it => ({
        ...it,
        envelope: from_base64(it.envelope),
        kemCipher: from_base64(it.kemCipher),
      })),
      folders: data.folders.map(it => ({
        ...it,
        envelope: from_base64(it.envelope),
        kemCipher: from_base64(it.kemCipher),
      })),
    }
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

  async initUpload(size: number, envelope: Uint8Array, kemCipher: Uint8Array, parentId: number) {
    const response: AxiosResponse<InitUploadResponse> = await instance.post(
      "/upload/init",
      {
        size,
        envelope: to_base64(envelope),
        kemCipher: to_base64(kemCipher),
        parentId,
      },
    );

    return response.data.data;
  },

  async completeUpload(id: number) {
    await instance.post(`/upload/${id}`);
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
      kemPub: to_base64(payload.kem.publicKey),
      kemPri: to_base64(payload.kem.privateKey),
      sgnPub: to_base64(payload.sgn.publicKey),
      sgnPri: to_base64(payload.sgn.privateKey),
      rootKemCipher: to_base64(payload.root.kemCipher),
      rootEnvelope: to_base64(payload.root.envelope),
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
      kemPub: from_base64(data.kemPub),
      kemPri: from_base64(data.kemPri),
      sgnPub: from_base64(data.sgnPub),
      sgnPri: from_base64(data.sgnPri),
      kdf: {
        ...data.kdf,
        salt: from_base64(data.kdf.salt),
      },
    } as FinishLoginResponse;
  },

  async createShare({
    envelope,
    kemCipher,
    fileId,
    receiver,
  }: CreateSharePayload) {
    const response = await instance.post<Serialized<Wrapped<NewShareResponse>>>(
      "/share",
      {
        fileId,
        receiver,
        envelope: to_base64(envelope),
        kemCipher: to_base64(kemCipher),
      },
    );

    return response.data.data;
  },

  async createPublicShare({
    kemCipher,
    envelope,
    fileId,
  }: CreatePublicSharePayload) {
    const response = await instance.post<Serialized<Wrapped<NewPublicShareResponse>>>(
      "/public-shares",
      {
        fileId,
        kemCipher: to_base64(kemCipher),
        envelope: to_base64(envelope),
      },
    );

    return response.data.data;
  },

  async getPublicShare(sid: string) {
    const response = await instance.get<Serialized<Wrapped<GetPublicShareResponse>>>(`/public-share/${sid}`);

    return {
      ...response.data.data,
      envelope: from_base64(response.data.data.envelope),
      kemCipher: from_base64(response.data.data.kemCipher),
      sgnPub: from_base64(response.data.data.sgnPub),
    };
  },

  async resolvePublicShareChunk(sid: string, index: number) {
    const response = await instance.get<PresignResponse>(`/public-share/${sid}/${index + 1}`);

    return response.data.data;
  },

  async getUser(username: string) {
    const response = await instance.get<Serialized<Wrapped<GetUserResponse>>>(
      `/user/${username}`,
    );

    const data = response.data.data;

    return {
      ...data,
      kemPub: from_base64(data.kemPub),
      sgnPub: from_base64(data.sgnPub)
    } as GetUserResponse;
  },

  async getShares(offset: number, limit: number) {
    const response = await instance.get<Serialized<Wrapped<GetSharesResponse>>>("/share", {
      params: {
        offset,
        limit,
      },
    });

    return response.data.data.map(it => ({
      ...it,
      envelope: from_base64(it.envelope),
      kemCipher: from_base64(it.kemCipher),
      sgnPub: from_base64(it.sgnPub)
    }));
  },

  async getMyShares(offset: number, limit: number) {
    const response = await instance.get<Serialized<Wrapped<GetMySharesResponse>>>("/share/my", {
      params: {
        offset,
        limit,
      },
    });

    return response.data.data.map(it => ({
      ...it,
      envelope: from_base64(it.envelope),
      kemCipher: from_base64(it.kemCipher),
    }));
  },

  async getShare(shareId: number) {
    const response = await instance.get<Serialized<Wrapped<GetShareResposne>>>(
      `/share/${shareId}`,
    );

    const data = response.data.data;

    return {
      ...data,
      envelope: from_base64(data.envelope),
      kemCipher: from_base64(data.kemCipher),
    } as GetShareResposne;
  },

  async getPublicShares(offset: number, limit: number) {
    const response = await instance.get<Serialized<Wrapped<GetPublicSharesResponse>>>(
      `/public-shares`,
      {
        params: {
          offset, limit
        }
      }
    );

    return response.data.data.map(it => ({
      ...it,
      envelope: from_base64(it.envelope),
      kemCipher: from_base64(it.kemCipher),
    }));
  },

  async getShareChunk(shareId: number, index: number) {
    const response = await instance.get<PresignResponse>(
      `/share/${shareId}/${index + 1}`,
    );

    return response.data.data;
  },

  async revokePublicShare(key: string) {
    await instance.delete(`/public-share/${key}`);
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
      Serialized<Wrapped<{
        total: number;
        items: Array<{
          id: number;
          level: string;
          messageEnvelope: Uint8Array;
          messageCipher: Uint8Array;
          extraEnvelope?: Uint8Array;
          extraCipher?: Uint8Array;
          createdAt: string;
        }>;
      }>>
    >("/audit/logs", { params });

    const data = response.data.data;

    return {
      total: data.total,
      items: data.items.map((it) => ({
        ...it,
        messageEnvelope: from_base64(it.messageEnvelope),
        messageCipher: from_base64(it.messageCipher),
        extraEnvelope: it.extraEnvelope
          ? from_base64(it.extraEnvelope)
          : undefined,
        extraCipher: it.extraCipher
          ? from_base64(it.extraCipher)
          : undefined,
      })),
    };
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

  async passwordChangeFinish(payload: PasswordChangeFinishPayload) {
    await instance.post("/me/password/finish", {
      opaqueRecord: to_base64(
        payload.opaqueRecord,
        base64_variants.URLSAFE_NO_PADDING,
      ),
      kemPri: to_base64(payload.kemPri, base64_variants.URLSAFE_NO_PADDING),
      sgnPri: to_base64(payload.sgnPri, base64_variants.URLSAFE_NO_PADDING),
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
