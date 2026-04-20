import { Dialog as BaseDialog } from "@base-ui/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Folder, FolderInput, FolderUp, X } from "lucide-react";
import { Spinner } from "../ui/spinner";
import { Fragment, useEffect, useMemo, useState } from "react";
import { open } from "@/lib/crypto";
import { from_base64, to_string } from "libsodium-wrappers-sumo";
import { useAppSelector } from "@/stores";
import api from "@/lib/api";
import { mutate } from "@/lib/swr";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import useAuth from "@/hooks/use-auth";
import useFiles from "@/hooks/use-files";

export type MoveDialogPayload = {
  type: "folder" | "file";
  id: number;
  name: string;
};

type BrowseItem = { id: number; name: string };
type BrowsePath = { id: number; name: string };

export default function MoveDialog({
  handle,
}: {
  handle: BaseDialog.Handle<MoveDialogPayload>;
}) {
  const { t } = useTranslation();

  return (
    <Dialog handle={handle}>
      {function Content({ payload }) {
        const keys = useAppSelector((s) => s.key.value);
        const { data: auth } = useAuth();
        const [browsePath, setBrowsePath] = useState<BrowsePath[]>([]);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState<string | null>(null);

        useEffect(() => {
          setBrowsePath([]);
          setError(null);
        }, [payload?.id]);

        const currentDirId =
          browsePath.length === 0 ? 0 : browsePath[browsePath.length - 1].id;

        const destinationId =
          browsePath.length === 0
            ? (auth?.rootFolder ?? 0)
            : browsePath[browsePath.length - 1].id;

        const { data: rawItems } = useFiles(currentDirId);

        const folders = useMemo<BrowseItem[]>(() => {
          if (!rawItems || !keys) return [];
          const result: BrowseItem[] = [];
          for (const item of rawItems) {
            try {
              const plaintext = open(
                from_base64(item.encryptedMetadata),
                from_base64(keys.pubKey),
                from_base64(keys.privKey),
              );
              const meta = JSON.parse(to_string(plaintext)) as {
                type: string;
                name: string;
              };
              if (meta.type === "folder") {
                if (payload?.type === "folder" && item.id === payload.id)
                  continue;
                result.push({ id: item.id, name: meta.name });
              }
            } catch {
              /* skip undecryptable */
            }
          }
          return result.sort((a, b) => a.name.localeCompare(b.name));
        }, [rawItems, keys, payload]);

        const handleMove = async () => {
          if (!payload || destinationId === 0) return;
          setLoading(true);
          setError(null);
          try {
            if (payload.type === "file") {
              await api.moveFile(payload.id, destinationId);
            } else {
              await api.moveFolder(payload.id, destinationId);
            }
            await mutate("file");
            handle.close();
            toast.success(t("common.moved"));
          } catch (e) {
            if (e instanceof AxiosError) {
              setError(
                e.response?.data?.error ?? t("common.requestFailed"),
              );
            } else {
              throw e;
            }
          } finally {
            setLoading(false);
          }
        };

        return (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("common.moveTitle", { name: payload?.name })}
              </DialogTitle>
            </DialogHeader>

            <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
              <button
                type="button"
                onClick={() => setBrowsePath([])}
                className="hover:text-foreground cursor-pointer"
              >
                /
              </button>
              {browsePath.map((seg, idx) => (
                <Fragment key={seg.id}>
                  <span>/</span>
                  <button
                    type="button"
                    onClick={() =>
                      setBrowsePath((prev) => prev.slice(0, idx + 1))
                    }
                    className="hover:text-foreground cursor-pointer"
                  >
                    {seg.name}
                  </button>
                </Fragment>
              ))}
            </div>

            <div className="border rounded-md min-h-32 max-h-64 overflow-y-auto divide-y">
              {browsePath.length > 0 && (
                <button
                  type="button"
                  onClick={() => setBrowsePath((prev) => prev.slice(0, -1))}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-sm text-left"
                >
                  <FolderUp
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                  {t("common.parentDir")}
                </button>
              )}
              {rawItems === undefined && (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              )}
              {rawItems !== undefined && folders.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-6">
                  {t("common.noSubfolders")}
                </p>
              )}
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() =>
                    setBrowsePath((prev) => [
                      ...prev,
                      { id: f.id, name: f.name },
                    ])
                  }
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-sm text-left"
                >
                  <Folder
                    size={16}
                    className="shrink-0 text-muted-foreground"
                  />
                  {f.name}
                </button>
              ))}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                onClick={handleMove}
                disabled={loading || destinationId === 0}
              >
                {loading ? <Spinner /> : <FolderInput size={16} />}
                {t("common.moveHere")}
              </Button>
              <DialogClose
                render={
                  <Button variant="outline" disabled={loading}>
                    <X />
                    {t("common.cancel")}
                  </Button>
                }
              />
            </DialogFooter>
          </DialogContent>
        );
      }}
    </Dialog>
  );
}
