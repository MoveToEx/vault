import { Dialog as BaseDialog } from "@base-ui/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Check, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "../ui/spinner";
import {
  signingPublicKeyDigest,
  trustSigningPublicKey,
} from "@/lib/trusted-signing-keys";
import { formatError } from "@/lib/utils";
import { toast } from "sonner";

export type TrustSigningKeyPayload = {
  userId: number;
  owner: string;
  publicKey: Uint8Array;
};

export default function TrustSigningKeyDialog({
  handle,
  onTrusted,
}: {
  handle: BaseDialog.Handle<TrustSigningKeyPayload>;
  onTrusted?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog handle={handle}>
      {function Content({ payload }) {
        const [digest, setDigest] = useState("");
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState("");

        useEffect(() => {
          setDigest("");
          setError("");
          if (!payload) return;

          void signingPublicKeyDigest(payload.publicKey)
            .then(setDigest)
            .catch((e) => setError(formatError(e)));
        }, [payload]);

        return (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("common.trustSigningKeyTitle")}</DialogTitle>
              <DialogDescription>
                {t("common.trustSigningKeyDescription", {
                  owner: payload?.owner ?? "",
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="size-4" />
                  {t("common.signingKeyDigest")}
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {digest || t("common.loadingEllipsis")}
                </p>
              </div>
              {error.length > 0 && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                disabled={!payload || loading || !digest}
                onClick={async () => {
                  if (!payload) return;

                  setLoading(true);
                  setError("");
                  try {
                    await trustSigningPublicKey(payload);
                    onTrusted?.();
                    toast.success(t("common.signingKeyTrusted"));
                    handle.close();
                  } catch (e) {
                    setError(formatError(e));
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? <Spinner /> : <Check />}
                {t("common.trustKey")}
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
