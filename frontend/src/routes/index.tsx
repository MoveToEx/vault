import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import useAuth from "@/hooks/use-auth";
import { Link } from "react-router";
import { FolderLock, Share2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/stores";
import { toggleLoginDialog, toggleRegisterDialog } from "@/stores/ui";
import { useTranslation } from "react-i18next";

export default function HomePage() {
  const dispatch = useAppDispatch();
  const { data, error, isLoading } = useAuth();
  const loggedIn = !isLoading && !error && !!data;
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-8 py-4">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("home.title")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("home.subtitle")}
        </p>
      </div>

      <ul className="space-y-4 text-sm text-muted-foreground">
        <li className="flex gap-3">
          <FolderLock className="mt-0.5 size-5 shrink-0 text-foreground" />
          <span>
            <strong className="text-foreground font-medium">
              {t("home.driveTitle")}
            </strong>{" "}
            — {t("home.driveBody")}
          </span>
        </li>
        <li className="flex gap-3">
          <Share2 className="mt-0.5 size-5 shrink-0 text-foreground" />
          <span>
            <strong className="text-foreground font-medium">
              {t("home.shareTitle")}
            </strong>{" "}
            — {t("home.shareBody")}
          </span>
        </li>
        <li className="flex gap-3">
          <Shield className="mt-0.5 size-5 shrink-0 text-foreground" />
          <span>
            <strong className="text-foreground font-medium">
              {t("home.auditTitle")}
            </strong>{" "}
            — {t("home.auditBody")}
          </span>
        </li>
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {isLoading ? (
          <Spinner />
        ) : loggedIn ? (
          <Link to="/drive" className={cn(buttonVariants())}>
            {t("common.openDrive")}
          </Link>
        ) : (
          <>
            <Button
              type="button"
              onClick={() => dispatch(toggleLoginDialog(true))}
            >
              {t("common.login")}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => dispatch(toggleRegisterDialog(true))}
            >
              {t("common.register")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
