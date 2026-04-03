import useTaggedSWR from "@/lib/swr";
import useAuth from "./use-auth";
import instance from "@/lib/axios";
import type { Wrapped } from "@/lib/types";

type Item = {
  id: number,
  encryptedMetadata: string;
  nonce: string;
  size: number;
}

export default function useFiles(dir: number) {
  const { data } = useAuth();

  return useTaggedSWR({
    id: 'files',
    tags: ['file', 'self'],
    args: [data?.id, dir] as const,
    fetcher: async (_, dir) => {
      const response = await instance.get<Wrapped<Item[]>>('/files', {
        params: {
          dir
        }
      });

      return response.data.data;
    },
  });
}