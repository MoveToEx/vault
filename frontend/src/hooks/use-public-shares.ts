import useTaggedSWR from "@/lib/swr";
import instance from "@/lib/axios";
import type { Wrapped } from "@/lib/types";
import useAuth from "./use-auth";

type PublicShare = {
  key: string,
  createdAt: string,
  expiresAt: string,
  encryptedMetadata: string,
};

export default function usePublicShares(page: number) {
  const { data } = useAuth();

  return useTaggedSWR({
    id: "public-shares",
    tags: ["public-share", "self"],
    args: [data?.id, page],
    fetcher: async (_, page) => {
      const response = await instance.get<Wrapped<PublicShare[]>>(`/public-shares?offset=${((page ?? 1) - 1) * 24}&limit=24`);

      return response.data.data;
    },
  });
}
