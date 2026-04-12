import instance from "@/lib/axios";
import useTaggedSWR from "@/lib/swr";
import type { Wrapped } from "@/lib/types";
import axios from "axios";
import { useLocalStorage } from "usehooks-ts";

type AuthResponse = {
  id: number;
  username: string;
  publicKey: string;
  encryptedPrivateKey: string;
  rootFolder: number;
  createdAt: string;
  permission: number;
  kdfSalt: string;
  kdfMemoryCost: number;
  kdfTimeCost: number;
  kdfParallelism: number;
};

export default function useAuth() {
  const [key, , removeAT] = useLocalStorage("vault-access-token", "");
  const [_, , removeRT] = useLocalStorage("vault-refresh-token", "");

  return {
    ...useTaggedSWR({
      id: "auth",
      tags: ["user", "self"],
      args: [key],
      async fetcher(key) {
        try {
          const response = await instance.get<Wrapped<AuthResponse>>(
            "/auth/get",
            {
              headers: {
                Authorization: "Bearer " + key,
              },
            },
          );
          return response.data.data;
        } catch (e) {
          if (axios.isAxiosError(e) && e.response?.status === 401) {
            return null;
          }
          throw e;
        }
      },
    }),
    reset: () => {
      removeAT();
      removeRT();
    },
  };
}
