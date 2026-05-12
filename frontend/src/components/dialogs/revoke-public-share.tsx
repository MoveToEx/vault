import { AlertDialog as BaseAlertDialog } from "@base-ui/react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import api from "@/lib/api";
import { mutate } from "@/lib/swr";
import { toast } from "sonner";
import { formatError } from "@/lib/utils";

export type Payload = {
  key: string;
  filename: string;
};

export default function RevokePublicShareDialog({
  handle,
}: {
  handle: BaseAlertDialog.Handle<Payload>;
}) {

  return (
    <AlertDialog handle={handle}>
      {function Content({ payload }) {
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState("");

        if (!payload) {
          return <></>
        }

        return (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm revocation</AlertDialogTitle>
              <AlertDialogDescription>
                <p>
                  {`You are about to revoke the public share of "${payload.filename}" (key: ${payload.key}).`}
                </p>
                <p>{"This share will be instantly invalidated."}</p>
                {error && (
                  <p className="text-destructive">{error}</p>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={loading}
                className="bg-destructive"
                onClick={async () => {
                  setLoading(true);
                  try {
                    await api.revokePublicShare(payload.key);
                    mutate("public-share");
                    toast.success("Public share revoked");
                    handle.close();
                  } catch (e) {
                    setError(formatError(e));
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        );
      }}
    </AlertDialog>
  );
}
