import useTaggedSWR from "@/shared/lib/swr";
import api from "@/shared/lib/api";

export default function usePublicShare(sid: string) {
  return useTaggedSWR({
    id: "public-share",
    tags: ["public-share"],
    args: [sid],
    fetcher: async (sid) => {
      return await api.getPublicShare(sid);
    },
    config: {
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      refreshInterval: 0,
    }
  });
}
