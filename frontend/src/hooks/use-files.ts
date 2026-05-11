import useTaggedSWR from "@/lib/swr";
import useAuth from "./use-auth";
import api from "@/lib/api";

export default function useFiles(dir: number) {
  const { data } = useAuth();

  return useTaggedSWR({
    id: "files",
    tags: ["file", "self"],
    args: [data?.id, dir] as const,
    fetcher: async (_, dir) => {
      return await api.getFiles(dir);
    },
  });
}
