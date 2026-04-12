import RequireUMK from "@/components/require-umk";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { open } from "@/lib/crypto";
import type { Metadata } from "@/lib/types";
import { useAppSelector } from "@/stores";
import useLogs, { AUDIT_LOG_PAGE_SIZE } from "@/hooks/use-logs";
import { from_base64, to_string } from "libsodium-wrappers-sumo";
import { Logs } from "lucide-react";
import { useMemo, useState } from "react";

const ACTION_LABELS: Record<string, string> = {
  register: "Account registration",
  login: "Signed in",
  session_refresh: "Session refreshed",
  list_folder: "Listed folder",
  get_file_metadata: "Opened file metadata",
  get_file_chunk: "Downloaded file chunk",
  update_file: "Updated file",
  update_folder: "Updated folder",
  delete_file: "Deleted file",
  create_folder: "Created folder",
  get_capacity: "Viewed storage usage",
  upload_init: "Started upload",
  upload_chunk_presign: "Upload chunk presign",
  upload_chunk_complete: "Upload chunk completed",
  upload_complete: "Upload finished",
  list_upload_sessions: "Listed upload sessions",
  share_user_lookup: "Looked up user for sharing",
  share_create: "Created share",
  share_incoming_list: "Listed incoming shares",
  share_outgoing_list: "Listed outgoing shares",
  share_get_metadata: "Opened share details",
  share_download_chunk: "Downloaded shared chunk",
  share_revoke: "Revoked share",
  user_profile_lookup: "Viewed user profile",
  admin_site_config_update: "Updated site configuration (admin)",
  admin_user_capacity: "Changed user storage capacity (admin)",
  admin_user_active: "Changed user active status (admin)",
};

type DecryptedRow = {
  id: number;
  createdAt: Date;
  action: string;
  actionLabel: string;
  /** Decrypted file/folder name from optional encrypted_metadata when present */
  itemLabel: string;
  details: string;
  level: string;
  decryptError?: string;
  itemMetaError?: string;
};

function formatDetails(payload: Record<string, unknown>): string {
  const { action: _a, ...rest } = payload;
  if (Object.keys(rest).length === 0) return "—";
  try {
    return JSON.stringify(rest, null, 0);
  } catch {
    return "—";
  }
}

export default function AuditPage() {
  const keys = useAppSelector((s) => s.key.value);
  const [page, setPage] = useState(0);
  const { data, isLoading, error } = useLogs(page);

  const total = data?.total ?? 0;

  const rows: DecryptedRow[] = useMemo(() => {
    if (!keys || !data) return [];

    const pub = from_base64(keys.pubKey);
    const priv = from_base64(keys.privKey);

    return data.items.map((it) => {
      let itemLabel = "—";
      let itemMetaError: string | undefined;

      if (it.encryptedMetadata) {
        try {
          const metaPlain = open(
            from_base64(it.encryptedMetadata),
            pub,
            priv,
          );
          const meta = JSON.parse(to_string(metaPlain)) as Metadata;
          if (meta && typeof meta === "object" && "name" in meta) {
            itemLabel = String(meta.name);
          }
        } catch {
          itemMetaError = "Could not decrypt item metadata";
        }
      }

      try {
        const plain = to_string(
          open(from_base64(it.message), pub, priv),
        );
        const payload = JSON.parse(plain) as Record<string, unknown>;
        const action =
          typeof payload.action === "string" ? payload.action : "unknown";
        return {
          id: it.id,
          createdAt: new Date(it.createdAt),
          action,
          actionLabel: ACTION_LABELS[action] ?? action,
          itemLabel: itemMetaError ? "—" : itemLabel,
          details: formatDetails(payload),
          level: it.level,
          itemMetaError,
        };
      } catch {
        return {
          id: it.id,
          createdAt: new Date(it.createdAt),
          action: "—",
          actionLabel: "—",
          itemLabel: itemMetaError ? "—" : itemLabel,
          details: "",
          level: it.level,
          decryptError: "Could not decrypt this entry",
          itemMetaError,
        };
      }
    });
  }, [data, keys]);

  const totalPages = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));
  const canPrev = page > 0;
  const canNext = (page + 1) * AUDIT_LOG_PAGE_SIZE < total;

  return (
    <>
      <RequireUMK />
      <div className="flex flex-col gap-6 max-w-5xl mx-auto">
        {!keys ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Logs />
              </EmptyMedia>
              <EmptyTitle>Unlock required</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : error ? (
          <p className="text-sm text-destructive">
            Could not load audit log. Try again later.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data?.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Logs />
              </EmptyMedia>
              <EmptyTitle>No activity yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-50">Time</TableHead>
                  <TableHead className="w-55">Action</TableHead>
                  <TableHead className="min-w-35 max-w-70">
                    Item
                  </TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-20">Level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground align-top">
                      {row.createdAt.toLocaleString()}
                    </TableCell>
                    <TableCell className="align-top font-medium">
                      {row.decryptError ? (
                        <span className="text-destructive text-sm">
                          {row.decryptError}
                        </span>
                      ) : (
                        row.actionLabel
                      )}
                    </TableCell>
                    <TableCell className="align-top text-sm wrap-break-word">
                      {row.itemMetaError ? (
                        <span className="text-muted-foreground text-xs">
                          {row.itemMetaError}
                        </span>
                      ) : (
                        row.itemLabel
                      )}
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs break-all">
                      {row.decryptError ? "—" : row.details}
                    </TableCell>
                    <TableCell className="align-top text-muted-foreground text-xs">
                      {row.level}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} · {total} entries
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canPrev || isLoading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canNext || isLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
