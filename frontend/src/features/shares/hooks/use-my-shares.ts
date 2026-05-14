import useTaggedSWR from "@/shared/lib/swr";
import useAuth from "@/features/auth/hooks/use-auth";
import api from "@/shared/lib/api";

export default function useMyShares(page: number) {
  const { data } = useAuth();

  return useTaggedSWR({
    id: "my-shares",
    tags: ["self", "share"],
    args: [data?.id, page] as const,
    fetcher: async (_, page) => {
      return await api.getMyShares((page - 1) * 24, 24);
    },
  });
}
