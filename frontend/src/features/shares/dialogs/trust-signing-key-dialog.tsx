import { Dialog as BaseDialog } from "@base-ui/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Check, ShieldQuestionMark, X } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/shared/components/ui/spinner";
import {
  trustSigningPublicKey,
} from "@/shared/lib/trusted-signing-keys";
import { formatError } from "@/shared/lib/utils";
import { toast } from "sonner";
import Digest from "@/shared/components/digest";

export type Payload = {
  userId: number;
  owner: string;
  publicKey: Uint8Array;
};

export default function TrustSigningKeyDialog({
  handle,
  onTrusted,
}: {
  handle: BaseDialog.Handle<Payload>;
  onTrusted?: () => void;
}) {

  return (
    <Dialog handle={handle}>
      {function Content({ payload }) {
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState("");

        return (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className='flex flex-row items-center gap-2'>
                <ShieldQuestionMark className='size-4' />
                Trust signing key
              </DialogTitle>
              <DialogDescription>
                Trust {payload?.owner}'s signing public key to reveal metadata.
              </DialogDescription>
            </DialogHeader>

            {payload && <Digest message={payload?.publicKey} />}

            {error.length > 0 && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button
                disabled={!payload || loading}
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
