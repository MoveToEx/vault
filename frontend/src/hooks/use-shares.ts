import useTaggedSWR from "@/lib/swr";
import useAuth from "./use-auth";
import instance from "@/lib/axios";
import type { Wrapped } from "@/lib/types";

type Item = {
  id: number;
  senderId: number;
  receiverId: number;
  sender: string;
  encryptedMetadata: string;
  encryptedKey: string;
  createdAt: string;
  expiresAt: string;
};

export default function useShares(page: number) {
  const { data } = useAuth();

  return useTaggedSWR({
    id: "shares",
    tags: ["self", "share"],
    args: [data?.id, page] as const,
    fetcher: async (_, page) => {
      const response = await instance.get<Wrapped<Item[]>>("/share", {
        params: {
          offset: (page - 1) * 24,
          limit: 24,
        },
      });

      return response.data.data;
    },
  });
}
