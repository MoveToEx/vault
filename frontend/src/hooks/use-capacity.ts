import useTaggedSWR from "@/lib/swr";
import useAuth from "./use-auth";
import instance from "@/lib/axios";
import type { Wrapped } from "@/lib/types";

type Response = {
  used: number,
  capacity: number,
}

export default function useCapacity() {
  const { data } = useAuth();

  return useTaggedSWR({
    id: "capacity",
    tags: ["file", "self"],
    args: [data?.id] as const,
    fetcher: async (_) => {
      const response = await instance.get<Wrapped<Response>>("/me/capacity");

      return response.data.data;
    },
  });
}
