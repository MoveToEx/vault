import useTaggedSWR from "@/lib/swr";
import api from "@/lib/api";
import useAuth from "./use-auth";

export const AUDIT_LOG_PAGE_SIZE = 20;

export default function useLogs(page: number) {
  const { data: auth } = useAuth();

  return useTaggedSWR({
    id: "logs",
    tags: ["log", "self"],
    args: [auth?.id, page] as const,
    fetcher: async (_userId, pageIndex) => {
      return api.getAuditLogs(AUDIT_LOG_PAGE_SIZE, pageIndex * AUDIT_LOG_PAGE_SIZE);
    },
  });
}
