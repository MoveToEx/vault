import { Provider as StoreProvider } from "react-redux";
import { store } from "@/shared/stores";
import { ThemeProvider } from "@/app/providers/theme-provider";
import { ModeToggle } from "@/app/mode-toggle";
import { Toaster } from "@/shared/components/ui/sonner";
import LoginDialog from "@/features/auth/components/login-dialog";
import RegisterDialog from "@/features/auth/components/register-dialog";
import useAuth from "@/features/auth/hooks/use-auth";
import { Link } from "react-router";
import { FolderLock, Lock, Share2, Shield } from "lucide-react";
import { Button, buttonVariants } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { useAppDispatch } from "@/shared/stores";
import { toggleLoginDialog, toggleRegisterDialog } from "@/shared/stores/ui";
import { cn } from "@/shared/lib/utils";

const features = [
  {
    icon: FolderLock,
    title: "Drive",
    description:
      "Unlock with your password to upload, download, and organize encrypted files and folders.",
  },
  {
    icon: Share2,
    title: "Share",
    description:
      "Grant access to specific files for other users or generate public links on demand.",
  },
  {
    icon: Shield,
    title: "Audit",
    description:
      "Review all activity tied to your account for full transparency and accountability.",
  },
];

function HomeContent() {
  const dispatch = useAppDispatch();
  const { data, error, isLoading } = useAuth();
  const loggedIn = !isLoading && !error && !!data;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <LoginDialog />
      <RegisterDialog />
      <Toaster position="top-center" />

      <header className="flex h-12 items-center justify-between px-6 py-4 border-b">
        <span className="text-lg tracking-tight">Vault</span>
        <ModeToggle />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-12 px-6 py-16">
        <div className="flex flex-col items-center text-center gap-5 max-w-lg">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
            <Lock className="size-9 text-primary" />
          </div>
          <div className="space-y-3">
            <h1 className="text-5xl font-thin tracking-tight">Vault</h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              A private workspace for your files. Encrypt uploads at rest,
              organize folders, and share with others — without exposing your
              data to the server.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title} size="sm">
              <CardHeader>
                <Icon className="size-5 text-primary mb-1" />
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {isLoading ? (
            <Spinner />
          ) : loggedIn ? (
            <Link to="/drive" className={cn(buttonVariants({ size: "lg" }))}>
              Open Drive
            </Link>
          ) : (
            <>
              <Button size="lg" onClick={() => dispatch(toggleLoginDialog(true))}>
                Login
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => dispatch(toggleRegisterDialog(true))}
              >
                Register
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <StoreProvider store={store}>
      <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
        <HomeContent />
      </ThemeProvider>
    </StoreProvider>
  );
}
