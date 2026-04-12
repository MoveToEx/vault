import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import useAuth from "@/hooks/use-auth";
import useTaggedSWR from "@/lib/swr";
import { formatSize } from "@/lib/utils";
import { PERMISSION_ADMIN } from "@/components/require-admin";
import { Spinner } from "@/components/ui/spinner";
import { useState } from "react";
import { toast } from "sonner";
import { mutate as invalidateAdminSWR } from "@/lib/swr";
import { Dialog as BaseDialog } from "@base-ui/react";
import SetUserCapacityDialog, {
  type SetUserCapacityPayload,
} from "@/components/dialogs/set-user-capacity";

const PAGE = 30;

const setUserCapacityHandle =
  BaseDialog.createHandle<SetUserCapacityPayload>();

type UserRow = {
  id: number;
  email: string;
  username: string;
  permission: number;
  capacity: number;
  isActive: boolean;
  isLocked: boolean;
  createdAt: string;
  lastLoginAt: string;
};

export default function AdminUsersPage() {
  const { data: me } = useAuth();
  const [page, setPage] = useState(0);

  const { data, isLoading, error, mutate } = useTaggedSWR({
    id: `admin-users`,
    tags: ["admin"],
    args: [],
    fetcher: () => api.listAdminUsers(PAGE, page * PAGE),
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  async function toggleActive(row: UserRow) {
    if (row.id === me?.id) return;
    const next = !row.isActive;
    try {
      await api.patchAdminUserActive(row.id, next);
      toast.success(next ? "User re-enabled." : "User banned.");
      await mutate();
      await invalidateAdminSWR("admin");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response
              ?.data?.message
          : undefined;
      toast.error(msg ?? "Could not update user.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> Loading users…
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-destructive">Could not load users.</p>
    );
  }

  return (
    <>
      <SetUserCapacityDialog
        handle={setUserCapacityHandle}
        onSaved={async () => {
          await mutate();
          await invalidateAdminSWR("admin");
        }}
      />

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="tabular-nums">{row.id}</TableCell>
                <TableCell className="font-medium">{row.username}</TableCell>
                <TableCell className="text-muted-foreground max-w-50 truncate">
                  {row.email}
                </TableCell>
                <TableCell>
                  {row.permission === PERMISSION_ADMIN ? "Admin" : "User"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatSize(row.capacity)}
                </TableCell>
                <TableCell>
                  {!row.isActive ? (
                    <span className="text-destructive">Banned</span>
                  ) : row.isLocked ? (
                    <span className="text-amber-600">Locked</span>
                  ) : (
                    <span className="text-muted-foreground">Active</span>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-2 whitespace-nowrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setUserCapacityHandle.openWithPayload({
                        userId: row.id,
                        username: row.username,
                        capacityBytes: row.capacity,
                      })
                    }
                  >
                    Capacity
                  </Button>
                  <Button
                    variant={row.isActive ? "destructive" : "default"}
                    size="sm"
                    disabled={row.id === me?.id}
                    onClick={() => toggleActive(row)}
                  >
                    {row.isActive ? "Ban" : "Unban"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="text-sm text-muted-foreground">
          {total} users · page {page + 1} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
