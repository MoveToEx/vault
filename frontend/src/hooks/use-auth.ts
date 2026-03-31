import instance from "@/lib/axios";
import useTaggedSWR from "@/lib/swr";
import type { Wrapped } from "@/lib/types";
import { useLocalStorage } from "usehooks-ts";

type AuthResponse = {
  id: number,
  username: string,
  publicKey: string,
  encryptedPrivateKey: string,
  privateKeyNonce: string,
  rootFolder: number,
  createdAt: string,
  kdfSalt: string,
  kdfMemoryCost: number,
  kdfTimeCost: number,
  kdfParallelism: number,
}

export default function useAuth() {
  const [session, , removeAT] = useLocalStorage('vault-access-token', '');
  const [, , removeRT] = useLocalStorage('vault-refresh-token', '');

  return {
    ...useTaggedSWR({
      type: '$custom',
      tags: ['user', 'self'],
      args: [session],
      async fetcher(session) {
        try {
          const response = await instance.get<Wrapped<AuthResponse>>('/auth/get', {
            headers: {
              'Authorization': 'Bearer ' + session
            }
          });
          return response.data.data;
        }
        catch {
          return null;
        }
      },
    }),
    reset: () => {
      removeAT();
      removeRT();
    },
  };
}