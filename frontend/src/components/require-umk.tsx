import { useAppSelector } from "@/stores";
import { useEffect } from "react";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react";
import UnlockDialog from "./dialogs/unlock";
import useAuth from "@/hooks/use-auth";

const handle = BaseAlertDialog.createHandle<undefined>();

export default function RequireKeys() {
  const keys = useAppSelector((state) => state.key.value);
  const { data, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || !data) return;

    if (!keys) {
      handle.open(null);
    }
  }, [keys, data, isLoading]);

  return <UnlockDialog handle={handle} />;
}
