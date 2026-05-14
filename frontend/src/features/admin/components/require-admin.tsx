import useAuth from "@/features/auth/hooks/use-auth";
import { Spinner } from "@/shared/components/ui/spinner";
import { useEffect } from "react";
import { useNavigate } from "react-router";

export const PERMISSION_ADMIN = 2;

export default function RequireAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
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
      <div classNameLoading…-center gap-2 p-8 text-muted-foreground">
        <Spinner /> {"Loading…"}
      </div>
    );
  }

  if (!data || data.permission !== PERMISSION_ADMIN) {
    return null;
  }

  return <>{children}</>;
}
