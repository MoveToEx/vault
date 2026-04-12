import RequireUMK from "@/components/require-umk";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { open } from "@/lib/crypto";
import type { Metadata } from "@/lib/types";
import { useAppSelector } from "@/stores";
import useLogs, {
  AUDIT_LOG_PAGE_SIZE,
  type AuditLogFilters,
} from "@/hooks/use-logs";
import { from_base64, to_string } from "libsodium-wrappers-sumo";
import { Logs } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const selectClassName = cn(
  "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50",
  "h-9 rounded-md border bg-transparent px-2.5 py-1 text-sm shadow-xs transition-[color,box-shadow]",
  "focus-visible:ring-[3px] outline-none min-w-[9rem]",
);

function localDatetimeInputToISO(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

type DecryptedRow = {
  id: number;
  createdAt: Date;
  action: string;
  actionLabel: string;
  /** Decrypted file/folder name from optional encrypted_metadata when present */
  itemLabel: string | null;
  details: string;
  level: string;
  decryptError?: string;
  itemMetaError?: string;
};

function formatDetails(
  payload: Record<string, unknown>,
  empty: string,
): string {
  const { action: _a, ...rest } = payload;
  if (Object.keys(rest).length === 0) return empty;
  try {
    return JSON.stringify(rest, null, 0);
  } catch {
    return empty;
  }
}

export default function AuditPage() {
  const { t } = useTranslation();
  const keys = useAppSelector((s) => s.key.value);
  const [page, setPage] = useState(0);
  const [level, setLevel] = useState("");
  const [fromLocal, setFromLocal] = useState("");
  const [toLocal, setToLocal] = useState("");

  const filters: AuditLogFilters = useMemo(
    () => ({
      level,
      fromISO: localDatetimeInputToISO(fromLocal),
      toISO: localDatetimeInputToISO(toLocal),
    }),
    [level, fromLocal, toLocal],
  );

  const { data, isLoading, error } = useLogs(page, filters);

  const hasActiveFilters = Boolean(level || fromLocal || toLocal);

  const total = data?.total ?? 0;

  const rows: DecryptedRow[] = useMemo(() => {
    if (!keys || !data) return [];

    const pub = from_base64(keys.pubKey);
    const priv = from_base64(keys.privKey);

    return data.items.map((it) => {
      let itemLabel = null;
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
          itemMetaError = t("common.couldNotDecryptItemMeta");
        }
      }

      try {
        const plain = to_string(
          open(from_base64(it.message), pub, priv),
        );
        const payload = JSON.parse(plain) as Record<string, unknown>;
        const action =
          typeof payload.action === "string" ? payload.action : "unknown";
        const actionLabel = t(`audit.actions.${action}`, {
          defaultValue: action,
        });
        return {
          id: it.id,
          createdAt: new Date(it.createdAt),
          action,
          actionLabel,
          itemLabel: itemMetaError ? null : itemLabel,
          details: formatDetails(payload, t("common.dash")),
          level: it.level,
          itemMetaError,
        };
      } catch {
        return {
          id: it.id,
          createdAt: new Date(it.createdAt),
          action: t("common.dash"),
          actionLabel: t("common.dash"),
          itemLabel: itemMetaError ? t("common.dash") : itemLabel,
          details: "",
          level: it.level,
          decryptError: t("common.couldNotDecryptEntry"),
          itemMetaError,
        };
      }
    });
  }, [data, keys, t]);

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
              <EmptyTitle>{t("common.unlockRequired")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex flex-col gap-2 min-w-40">
                <Label htmlFor="audit-level">{t("common.level")}</Label>
                <select
                  id="audit-level"
                  className={selectClassName}
                  value={level}
                  onChange={(e) => {
                    setPage(0);
                    setLevel(e.target.value);
                  }}
                >
                  <option value="">{t("common.allLevels")}</option>
                  <option value="trace">{t("common.trace")}</option>
                  <option value="info">{t("common.info")}</option>
                  <option value="warning">{t("common.warning")}</option>
                  <option value="critical">{t("common.critical")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-2 min-w-48">
                <Label htmlFor="audit-from">{t("common.from")}</Label>
                <Input
                  id="audit-from"
                  type="datetime-local"
                  value={fromLocal}
                  onChange={(e) => {
                    setPage(0);
                    setFromLocal(e.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-2 min-w-48">
                <Label htmlFor="audit-to">{t("common.to")}</Label>
                <Input
                  id="audit-to"
                  type="datetime-local"
                  value={toLocal}
                  onChange={(e) => {
                    setPage(0);
                    setToLocal(e.target.value);
                  }}
                />
              </div>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="sm:mb-0.5"
                  onClick={() => {
                    setLevel("");
                    setFromLocal("");
                    setToLocal("");
                  }}
                >
                  {t("common.clearFilters")}
                </Button>
              ) : null}
            </div>
            {error ? (
              <p className="text-sm text-destructive">
                {t("common.auditLoadError")}
              </p>
            ) : isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("common.loadingEllipsis")}
              </p>
            ) : data?.items.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Logs />
                  </EmptyMedia>
                  <EmptyTitle>
                    {hasActiveFilters
                      ? t("common.noMatchingEntries")
                      : t("common.noActivityYet")}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-50">{t("common.time")}</TableHead>
                      <TableHead className="w-55">{t("common.action")}</TableHead>
                      <TableHead className="min-w-35 max-w-70">
                        {t("common.item")}
                      </TableHead>
                      <TableHead>{t("common.details")}</TableHead>
                      <TableHead className="w-20">{t("common.level")}</TableHead>
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
                          ) : row.itemLabel === null ? (
                            <span className='text-muted-foreground text-xs'>
                              {t("common.hyphen")}
                            </span>
                          ) : row.itemLabel}
                        </TableCell>
                        <TableCell className="align-top font-mono text-xs break-all">
                          {row.decryptError ? t("common.hyphen") : row.details}
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
                    {t("common.auditPageSummary", {
                      page: page + 1,
                      totalPages,
                      total,
                    })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canPrev || isLoading}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      {t("common.previous")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canNext || isLoading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
