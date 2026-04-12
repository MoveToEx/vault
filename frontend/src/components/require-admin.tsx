import useAuth from "@/hooks/use-auth";
import { Spinner } from "@/components/ui/spinner";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

export const PERMISSION_ADMIN = 2;

export default function RequireAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (error || !data) {
      navigate("/");
      return;
    }
    if (data.permission !== PERMISSION_ADMIN) {
      navigate("/");
    }
  }, [data, error, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Spinner /> {t("common.loadingEllipsis")}
      </div>
    );
  }

  if (!data || data.permission !== PERMISSION_ADMIN) {
    return null;
  }

  return <>{children}</>;
}
