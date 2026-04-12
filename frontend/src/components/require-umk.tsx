import { useAppSelector } from "@/stores";
import { useEffect } from "react";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react";
import UnlockDialog from "./dialogs/unlock";
import useAuth from "@/hooks/use-auth";
import { useNavigate } from "react-router";

const handle = BaseAlertDialog.createHandle<undefined>();

export default function RequireKeys() {
  const keys = useAppSelector((state) => state.key.value);
  const { data, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || data === undefined) return;

    if (data === null) {
      navigate('/');
    }

    if (!keys) {
      handle.open(null);
    }
  }, [keys, data, isLoading, navigate]);

  return <UnlockDialog handle={handle} />;
}
