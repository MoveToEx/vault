import useTaggedSWR from "@/lib/swr";
import instance from "@/lib/axios";
import type { Wrapped } from "@/lib/types";

type PublicShare = {
  key: string,
  owner: string,
  size: number,
  chunks: number,
  chunkSize: number,
  createdAt: string,
  encryptedMetadata: string,
  encryptedKey: string,
};

export default function usePublicShare(key: string) {
  return useTaggedSWR({
    id: "public-share",
    tags: ["public-share"],
    args: [key],
    fetcher: async (key) => {
      const response = await instance.get<Wrapped<PublicShare>>(`/public-share/${key}`);

      return response.data.data;
    },
  });
}
