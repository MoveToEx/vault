import { useAppSelector } from "@/stores";
import { useEffect } from "react";
import { AlertDialog as BaseAlertDialog } from '@base-ui/react';
import UnlockDialog from "./dialogs/unlock";
import useAuth from "@/hooks/use-auth";

const handle = BaseAlertDialog.createHandle<undefined>();

export default function RequireUMK() {
  const umk = useAppSelector(state => state.umk.value);
  const { data, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || !data) return;

    if (!umk) {
      handle.open(null);
    }
  }, [umk, data, isLoading]);

  return (
    <UnlockDialog handle={handle} />
  );
}