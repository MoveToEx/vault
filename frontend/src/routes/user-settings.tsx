import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import useAuth from "@/hooks/use-auth";
import useTaggedSWR, { mutate as revalidateByTag } from "@/lib/swr";
import { aeadComposite, kdf } from "@/lib/crypto";
import { formatError, logout } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/stores";
import { reset as resetKeys, set as setKeys } from "@/stores/key";
import {
  OpaqueClient,
  OpaqueID,
  RegistrationResponse,
  getOpaqueConfig,
  type RegistrationClient,
} from "@cloudflare/opaque-ts";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { ChevronDown, ChevronUp, Shield } from "lucide-react";
import sodium, { from_base64, to_base64 } from "libsodium-wrappers-sumo";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import z from "zod";
import { argon2id } from "@/workers";
import { Slider } from "@/components/ui/slider";
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
import { useTranslation } from "react-i18next";

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function UserSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: auth, isLoading: authLoading, reset: resetAuth } = useAuth();

  useEffect(() => {
    if (!authLoading && auth === null) {
      navigate("/");
    }
  }, [auth, authLoading, navigate]);

  if (authLoading || auth === undefined) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> {t("common.loadingEllipsis")}
      </div>
    );
  }

  if (!auth) {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">

      <Tabs
        orientation="vertical"
        defaultValue="security"
        className="flex w-full flex-col gap-6 sm:flex-row sm:items-start sm:gap-10"
      >
        <TabsList
          variant="line"
          className="h-fit w-full shrink-0 flex-col items-stretch justify-start sm:w-52"
        >
          <TabsTrigger value="security" className="justify-start gap-2">
            <Shield className="size-4" />
            {t("common.security")}
          </TabsTrigger>
        </TabsList>

        <div className="min-w-0 flex-1">
          <TabsContent value="security" className="flex flex-col gap-2">
            <Sessions />
            <ChangePassword auth={auth} username={auth.username} />
            <DeleteAccount username={auth.username} resetAuth={resetAuth} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function Sessions() {
  const { t } = useTranslation();
  const { data, isLoading, mutate } = useTaggedSWR({
    id: "sessions",
    tags: ["user", "self"],
    args: [],
    fetcher: () => api.listSessions(),
  });

  async function revoke(id: number) {
    try {
      await api.revokeSession(id);
      toast.success(t("common.sessionInvalidated"));
      await mutate();
      await revalidateByTag("self");
    } catch (e) {
      const msg =
        e instanceof AxiosError ? e.response?.data?.error : undefined;
      toast.error(msg ?? t("common.couldNotRevokeSession"));
    }
  }

  return (
    <div className='p-2'>
      <div className='flex flex-col justify-center items-start gap-2'>
        <span className='text-lg'>{t("common.loginSessions")}</span>
        <span className='text-muted-foreground'>
          {t("common.loginSessionsHint")}
        </span>
      </div>
      <div>
        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner /> {t("common.loadingSessions")}
          </div>
        ) : !data?.length ? (
          <p className="text-muted-foreground text-sm">
            {t("common.noActiveSessions")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.createdCol")}</TableHead>
                <TableHead>{t("common.expiresCol")}</TableHead>
                <TableHead>{t("common.lastUsedCol")}</TableHead>
                <TableHead className="w-30"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-muted-foreground">
                    {formatTs(s.createdAt)}
                    {s.current ? (
                      <span className="text-foreground ml-2 rounded border border-border px-1.5 py-0.5 text-xs">
                        {t("common.thisDevice")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTs(s.expiresAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.lastUsedAt ? formatTs(s.lastUsedAt) : t("common.dash")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => revoke(s.id)}
                    >
                      {t("common.invalidate")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function ChangePassword({
  auth,
  username,
}: {
  username: string;
  auth: {
    kdfSalt: string;
    kdfMemoryCost: number;
    kdfTimeCost: number;
    kdfParallelism: number;
  };
}) {
  const { t } = useTranslation();
  const keys = useAppSelector((s) => s.key.value);
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [showKDF, setShowKDF] = useState(false);

  const changePwdSchema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t("common.enterCurrentPassword")),
          newPassword: z
            .string()
            .min(8, t("common.atLeast8"))
            .max(128, t("common.atMost128")),
          confirmPassword: z
            .string()
            .min(8, t("common.atLeast8"))
            .max(128, t("common.atMost128")),
          kdfMemoryCost: z.number().min(64).max(1024),
          kdfTimeCost: z.number().min(1).max(100),
          kdfParallelism: z.number().min(1).max(4),
        })
        .refine((d) => d.newPassword === d.confirmPassword, {
          message: t("common.passwordsMismatch"),
          path: ["confirmPassword"],
        }),
    [t],
  );

  const form = useForm<z.infer<typeof changePwdSchema>>({
    resolver: zodResolver(changePwdSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      kdfMemoryCost: auth.kdfMemoryCost,
      kdfTimeCost: auth.kdfTimeCost,
      kdfParallelism: auth.kdfParallelism,
    },
  });

  useEffect(() => {
    form.reset({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      kdfMemoryCost: auth.kdfMemoryCost,
      kdfTimeCost: auth.kdfTimeCost,
      kdfParallelism: auth.kdfParallelism,
    });
  }, [auth, form]);

  async function onSubmit(data: z.infer<typeof changePwdSchema>) {
    if (!keys) return;

    await sodium.ready;
    setLoading(true);

    try {
      const testUmk = await argon2id({
        iterations: auth.kdfTimeCost,
        memorySize: auth.kdfMemoryCost * 1024,
        parallelism: auth.kdfParallelism,
        password: new TextEncoder().encode(data.currentPassword),
        salt: from_base64(auth.kdfSalt),
        hashLength: 32,
      });

      if (!sodium.memcmp(from_base64(keys.umk), testUmk)) {
        form.setError("currentPassword", {
          type: "validate",
          message: t("common.currentPasswordIncorrect"),
        });
        return;
      }

      const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
      const client: RegistrationClient = new OpaqueClient(cfg);

      const req = await client.registerInit(data.newPassword);

      if (req instanceof Error) {
        throw req;
      }

      const message = await api.passwordChangeStart(new Uint8Array(req.serialize()));

      const fin = await client.registerFinish(
        RegistrationResponse.deserialize(cfg, Array.from(message)),
        "vault",
        username,
      );

      if (fin instanceof Error) {
        throw fin;
      }

      const salt = new Uint8Array(16);
      window.crypto.getRandomValues(salt);

      const umk = await argon2id({
        iterations: data.kdfTimeCost,
        memorySize: data.kdfMemoryCost * 1024,
        parallelism: data.kdfParallelism,
        password: new TextEncoder().encode(data.newPassword),
        salt,
        hashLength: 32,
      });

      const kek = kdf(umk, "KEK");
      const epk = aeadComposite(from_base64(keys.privKey), kek);

      await api.passwordChangeFinish({
        opaqueRecord: new Uint8Array(fin.record.serialize()),
        privateKey: epk,
        kdf: {
          salt,
          memoryCost: data.kdfMemoryCost,
          timeCost: data.kdfTimeCost,
          parallelism: data.kdfParallelism,
        },
      });

      toast.success(t("common.passwordUpdated"));
      dispatch(
        setKeys({
          umk: to_base64(umk),
          privKey: keys.privKey,
          pubKey: keys.pubKey,
        }),
      );
      await revalidateByTag("self");
    } catch (e) {
      form.setError("root", {
        type: "custom",
        message: formatError(e),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='p-2'>
      <div className='flex flex-col justify-center items-start gap-2 pb-4'>
        <span className='text-lg'>{t("common.changePassword")}</span>
      </div>
      <div>
        {!keys ? (
          <p className="text-muted-foreground text-sm">
            {t("common.unlockVaultHint")}
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            {form.formState.errors.root?.message ? (
              <p className="text-destructive text-sm">
                {form.formState.errors.root.message}
              </p>
            ) : null}
            <FieldGroup>
              <Controller
                name="currentPassword"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="pwd-current">
                      {t("common.currentPassword")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="pwd-current"
                      type="password"
                      autoComplete="current-password"
                    />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : null}
                  </Field>
                )}
              />
              <Controller
                name="newPassword"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="pwd-new">
                      {t("common.newPassword")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="pwd-new"
                      type="password"
                      autoComplete="new-password"
                    />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : null}
                  </Field>
                )}
              />
              <Controller
                name="confirmPassword"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="pwd-confirm">
                      {t("common.confirmNewPassword")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="pwd-confirm"
                      type="password"
                      autoComplete="new-password"
                    />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : null}
                  </Field>
                )}
              />
            </FieldGroup>

            <div className="flex w-full flex-row items-center justify-end">
              <Button
                type="button"
                variant="link"
                onClick={() => setShowKDF((v) => !v)}
              >
                {showKDF ? <ChevronUp /> : <ChevronDown />}
                {t("common.advanced")}
              </Button>
            </div>

            {showKDF ? (
              <FieldSet>
                <FieldLegend>{t("common.kdfNewPassword")}</FieldLegend>
                <FieldGroup>
                  <Controller
                    name="kdfTimeCost"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel className="flex flex-row items-center justify-between">
                          <span>{t("common.timeCost")}</span>
                          <span>{field.value}</span>
                        </FieldLabel>
                        <Slider
                          {...field}
                          className="mx-auto h-1 w-full max-w-xs"
                          onValueChange={field.onChange}
                          step={1}
                          min={1}
                          max={10}
                        />
                        {fieldState.invalid ? (
                          <FieldError errors={[fieldState.error]} />
                        ) : null}
                      </Field>
                    )}
                  />
                  <Controller
                    name="kdfMemoryCost"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel className="flex flex-row items-center justify-between">
                          <span>{t("common.memoryCost")}</span>
                          <span>{field.value} MiB</span>
                        </FieldLabel>
                        <Slider
                          {...field}
                          className="mx-auto h-1 w-full max-w-xs"
                          onValueChange={field.onChange}
                          step={64}
                          min={64}
                          max={1024}
                        />
                        {fieldState.invalid ? (
                          <FieldError errors={[fieldState.error]} />
                        ) : null}
                      </Field>
                    )}
                  />
                  <Controller
                    name="kdfParallelism"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel className="flex flex-row items-center justify-between">
                          <span>{t("common.parallelism")}</span>
                          <span>{field.value}</span>
                        </FieldLabel>
                        <Slider
                          {...field}
                          className="mx-auto h-1 w-full max-w-xs"
                          onValueChange={field.onChange}
                          step={1}
                          min={1}
                          max={4}
                        />
                        {fieldState.invalid ? (
                          <FieldError errors={[fieldState.error]} />
                        ) : null}
                      </Field>
                    )}
                  />
                </FieldGroup>
              </FieldSet>
            ) : null}

            <Button type="submit" disabled={loading}>
              {loading ? <Spinner /> : null}
              {t("common.updatePassword")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function DeleteAccount({
  username,
  resetAuth,
}: {
  username: string;
  resetAuth: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    if (confirm !== username) {
      toast.error(t("common.typeUsernameToConfirm"));
      return;
    }
    setLoading(true);
    try {
      await api.deleteAccount(confirm);
      toast.success(t("common.accountDeleted"));
      resetAuth();
      dispatch(resetKeys());
      logout();
      await revalidateByTag("self");
      navigate("/");
    } catch (e) {
      const msg =
        e instanceof AxiosError ? e.response?.data?.error : undefined;
      toast.error(msg ?? t("common.couldNotDeleteAccount"));
    } finally {
      setLoading(false);
      setOpen(false);
      setConfirm("");
    }
  }

  return (
    <div className="p-2 border-destructive/35">
      <div className='flex flex-col justify-center items-start gap-2 pb-4'>
        <span className="text-destructive">{t("common.deleteAccount")}</span>
        <span className='text-muted-foreground'>
          {t("common.deleteAccountWarning")}
        </span>
      </div>
      <div>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setOpen(true)}
          >
            {t("common.deleteMyAccount")}
          </Button>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("common.deleteAccountTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("common.deleteAccountTypeUsername", { username })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className="mt-2"
            />
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel type="button">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={loading || confirm !== username}
                onClick={(e) => {
                  e.preventDefault();
                  void onDelete();
                }}
              >
                {loading ? <Spinner /> : null}
                {t("common.deleteForever")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
