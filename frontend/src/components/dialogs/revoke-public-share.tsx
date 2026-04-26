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
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export type Payload = {
  key: string;
  filename: string;
};

export default function RevokePublicShareDialog({
  handle,
}: {
  handle: BaseAlertDialog.Handle<Payload>;
}) {
  const { t } = useTranslation();

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
              <AlertDialogTitle>{t("common.confirmRevocation")}</AlertDialogTitle>
              <AlertDialogDescription>
                <p>
                  {t("common.revokePublicShareMessage", {
                    key: payload.key,
                    filename: payload.filename,
                  })}
                </p>
                <p>{t("common.publicShareInvalidatedNote")}</p>
                {error && (
                  <p className="text-destructive">{error}</p>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={loading}
                className="bg-destructive"
                onClick={async () => {
                  setLoading(true);
                  try {
                    await api.revokePublicShare(payload.key);
                    mutate("public-share");
                    toast.success(t("common.publicShareRevoked"));
                    handle.close();
                  } catch (e) {
                    if (e instanceof AxiosError) {
                      setError(e.response?.data?.error);
                    } else if (e instanceof Error) {
                      setError(e.message);
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {t("common.continue")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        );
      }}
    </AlertDialog>
  );
}
