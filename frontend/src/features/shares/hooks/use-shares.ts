import useTaggedSWR from "@/shared/lib/swr";
import useAuth from "@/features/auth/hooks/use-auth";
import api from "@/shared/lib/api";

export default function useShares(page: number) {
  const { data } = useAuth();

  return useTaggedSWR({
    id: "shares",
    tags: ["self", "share"],
    args: [data?.id, page] as const,
    fetcher: async (_, page) => {
      return await api.getShares((page - 1) * 24, 24);
    },
  });
}
