import api from "@/lib/api";
import { formatSize } from "@/lib/utils";
import useTaggedSWR from "@/lib/swr";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "react-i18next";

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useTaggedSWR({
    id: "admin-stats",
    tags: ["admin"],
    args: [],
    fetcher: () => api.getAdminStats(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> {t("common.loadingStatistics")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        {t("common.couldNotLoadDashboard")}
      </p>
    );
  }

  const cards = [
    { label: t("common.registeredUsers"), value: String(data.userCount) },
    { label: t("common.filesStored"), value: String(data.fileCount) },
    {
      label: t("common.totalStorageUsed"),
      value: formatSize(data.totalStoredBytes),
    },
    {
      label: t("common.activeUploadSessions"),
      value: String(data.activeUploadSessions),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-lg border bg-card text-card-foreground p-5 shadow-sm"
        >
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}
