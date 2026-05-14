import useTaggedSWR from "@/shared/lib/swr";
import useAuth from "@/features/auth/hooks/use-auth";
import api from "@/shared/lib/api";

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
