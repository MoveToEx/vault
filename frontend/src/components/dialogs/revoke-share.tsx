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
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatError } from "@/lib/utils";

type Payload = {
  id: number;
  filename: string;
};

export default function RevokeShareDialog({
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

        return (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("common.confirmRevocation")}</AlertDialogTitle>
              <AlertDialogDescription>
                <p>{t("common.revokeShareConfirm")}</p>
                {error.length > 0 && (
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
                    await api.revokeShare(payload?.id ?? 0);
                    mutate("share");
                    toast.success(t("common.shareRevoked"));
                    handle.close();
                  } catch (e) {
                    setError(formatError(e));
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
