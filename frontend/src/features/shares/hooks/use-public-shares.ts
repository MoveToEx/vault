import useTaggedSWR from "@/shared/lib/swr";
import useAuth from "@/features/auth/hooks/use-auth";
import api from "@/shared/lib/api";

export default function usePublicShares(page: number) {
  const { data } = useAuth();

  return useTaggedSWR({
    id: "public-shares",
    tags: ["public-share", "self"],
    args: [data?.id, page] as const,
    fetcher: async (_, page) => {
      return await api.getPublicShares((page - 1) * 24, 24);
    },
  });
}
