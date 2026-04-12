import useTaggedSWR from "@/lib/swr";
import api from "@/lib/api";
import useAuth from "./use-auth";

export const AUDIT_LOG_PAGE_SIZE = 20;

export type AuditLogFilters = {
  level: string;
  fromISO: string | undefined;
  toISO: string | undefined;
};

export default function useLogs(page: number, filters: AuditLogFilters) {
  const { data: auth } = useAuth();

  return useTaggedSWR({
    id: "logs",
    tags: ["log", "self"],
    args: [auth?.id, page, filters.level, filters.fromISO, filters.toISO] as const,
    fetcher: async (_userId, pageIndex, level, fromISO, toISO) => {
      return api.getAuditLogs(
        AUDIT_LOG_PAGE_SIZE,
        pageIndex * AUDIT_LOG_PAGE_SIZE,
        {
          ...(level ? { level } : {}),
          ...(fromISO ? { from: fromISO } : {}),
          ...(toISO ? { to: toISO } : {}),
        },
      );
    },
  });
}
