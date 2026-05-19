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
import { Fingerprint, KeyRound, ShieldCheck, X } from "lucide-react";
import { useMemo } from "react";
import { useKeys } from "@/shared/stores";
import { DropdownMenuItem } from "@/shared/components/ui/dropdown-menu";
import { Dialog as BaseDialog } from "@base-ui/react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import sodium from "libsodium-wrappers-sumo";
import Digest from "@/shared/components/digest";

const handle = BaseDialog.createHandle();

export function PubkeyDialogMenuItem() {
  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={() => handle.open(null)}
    >
      <KeyRound />
      My public key
    </DropdownMenuItem>
  );
}

export default function PubkeyDialog() {
  const keys = useKeys();

  const pk = useMemo(() => {
    if (!keys) return null;

    return sodium.crypto_sign_ed25519_sk_to_pk(keys.sign.privateKey);
  }, [keys]);

  return (
    <Dialog handle={handle}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className='flex flex-row items-center gap-2'>
            <Fingerprint className="size-4" />
            Signing public key digest
          </DialogTitle>
          <DialogDescription>
            Use this digest to allow other recepients to verify your signing key via a trusted channel.
          </DialogDescription>
        </DialogHeader>

        {pk && <Digest message={pk} />}

        <Alert>
          <ShieldCheck />
          <AlertTitle>Trusted public key</AlertTitle>
          <AlertDescription>
            This public key is deduced from your private key which cannot be forged.
          </AlertDescription>
        </Alert>

        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline">
                <X />
                Close
              </Button>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
