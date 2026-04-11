import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import useAuth from "@/hooks/use-auth";
import { Link } from "react-router";
import { FolderLock, Share2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/stores";
import { toggleLoginDialog, toggleRegisterDialog } from "@/stores/ui";

export default function HomePage() {
  const dispatch = useAppDispatch();
  const { data, error, isLoading } = useAuth();
  const loggedIn = !isLoading && !error && !!data;

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-8 py-4">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Vault</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          A private workspace for your files: encrypt uploads at rest, browse
          folders, and share with others—without exposing your data to the
          server in plaintext.
        </p>
      </div>

      <ul className="space-y-4 text-sm text-muted-foreground">
        <li className="flex gap-3">
          <FolderLock className="mt-0.5 size-5 shrink-0 text-foreground" />
          <span>
            <strong className="text-foreground font-medium">Drive</strong> —
            unlock with your password to upload, download, and organize
            encrypted files and folders.
          </span>
        </li>
        <li className="flex gap-3">
          <Share2 className="mt-0.5 size-5 shrink-0 text-foreground" />
          <span>
            <strong className="text-foreground font-medium">Share</strong> —
            grant access to specific files for other users when you choose.
          </span>
        </li>
        <li className="flex gap-3">
          <Shield className="mt-0.5 size-5 shrink-0 text-foreground" />
          <span>
            <strong className="text-foreground font-medium">Audit</strong> —
            review activity tied to your account for transparency.
          </span>
        </li>
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {isLoading ? (
          <Spinner />
        ) : loggedIn ? (
          <Link to="/drive" className={cn(buttonVariants())}>
            Open Drive
          </Link>
        ) : (
          <>
            <Button
              type="button"
              onClick={() => dispatch(toggleLoginDialog(true))}
            >
              Login
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => dispatch(toggleRegisterDialog(true))}
            >
              Register
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
