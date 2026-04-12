import api from "@/lib/api";
import { formatSize } from "@/lib/utils";
import useTaggedSWR from "@/lib/swr";
import { Spinner } from "@/components/ui/spinner";

export default function AdminDashboardPage() {
  const { data, isLoading, error, mutate } = useTaggedSWR({
    id: "admin-stats",
    tags: ["admin"],
    args: [],
    fetcher: () => api.getAdminStats(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> Loading statistics…
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        Could not load dashboard statistics.
      </p>
    );
  }

  const cards = [
    { label: "Registered users", value: String(data.userCount) },
    { label: "Files stored", value: String(data.fileCount) },
    {
      label: "Total storage used",
      value: formatSize(data.totalStoredBytes),
    },
    {
      label: "Active upload sessions",
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
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      ))}
      <div className="sm:col-span-2">
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => mutate()}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
