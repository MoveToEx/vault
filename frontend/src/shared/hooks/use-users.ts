import instance from "@/shared/lib/axios";
import useTaggedSWR from "@/shared/lib/swr";
import type { Wrapped } from "@/shared/lib/types";

type Item = {
  id: number;
  publicKey: string;
  username: string;
};

export default function useUsers(key: string) {
  return useTaggedSWR({
    id: "users",
    tags: [],
    args: [key] as const,
    fetcher: async (key) => {
      const response = await instance.get<Wrapped<Item[]>>("/share/lookup", {
        params: {
          key,
        },
      });

      return response.data.data;
    },
  });
}
