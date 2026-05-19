import { useAppSelector } from "@/shared/stores";
import { useEffect } from "react";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react";
import UnlockDialog from "@/features/auth/components/unlock-dialog";
import useAuth from "@/features/auth/hooks/use-auth";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const handle = BaseAlertDialog.createHandle<undefined>();

export default function RequireKeys() {
  const keys = useAppSelector((state) => state.key.value);
  const { data, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || data === undefined) return;

    if (data === null) {
      toast.info('Session expired. Please login again.');
      navigate('/');
    }

    if (!keys) {
      handle.open(null);
    }
  }, [keys, data, isLoading, navigate]);

  return <UnlockDialog handle={handle} />;
}
