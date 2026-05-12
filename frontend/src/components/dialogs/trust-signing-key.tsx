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
              <DialogTitle>Trust signing key</DialogTitle>
              <DialogDescription>
                {`Trust ${payload?.owner ?? ""}'s signing public key before showing encrypted share metadata from this sender.`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="size-4" />
                  Signing public key digest
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {digest || "Loading…"}
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
                    toast.success("Signing key trusted");
                    handle.close();
                  } catch (e) {
                    setError(formatError(e));
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? <Spinner /> : <Check />}
                Trust key
              </Button>
              <DialogClose
                render={
                  <Button variant="outline" disabled={loading}>
                    <X />
                    Cancel
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
