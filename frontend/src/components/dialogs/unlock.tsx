import useAuth from "@/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react";
import z from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { useState } from "react";
import { formatError, logout } from "@/lib/utils";
import { argon2id } from "@/workers";
import { useAppDispatch } from "@/stores";
import { set } from "@/stores/key";
import { to_base64, from_base64 } from "libsodium-wrappers";
import { Spinner } from "../ui/spinner";
import { Key, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PrivateKey } from "@/lib/crypto_wrappers";

const schema = z.object({
  password: z.string(),
});

export default function UnlockDialog({
  handle,
}: {
  handle: BaseAlertDialog.Handle<void>;
}) {
  const { t } = useTranslation();
  const { data: auth, reset, error } = useAuth();
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: "",
    },
    disabled: loading || error,
  });

  const submit = async (data: z.infer<typeof schema>) => {
    if (!auth) return;

    setLoading(true);

    try {
      const umk = await argon2id({
        iterations: auth.kdfTimeCost,
        memorySize: auth.kdfMemoryCost * 1024,
        password: new TextEncoder().encode(data.password),
        salt: from_base64(auth.kdfSalt),
        hashLength: 32,
      });

      const kemPri = PrivateKey.decrypt(umk, from_base64(auth.kemPri));
      const sgnPri = PrivateKey.decrypt(umk, from_base64(auth.sgnPri));

      dispatch(
        set({
          umk: to_base64(umk),
          kem: {
            privateKey: to_base64(kemPri),
            publicKey: auth.kemPub,
          },
          sign: {
            privateKey: to_base64(sgnPri),
            publicKey: auth.sgnPub
          }
        }),
      );

      handle.close();
    } catch (e) {
      form.setError('password', {
        type: 'value',
        message: formatError(e)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog handle={handle} onOpenChangeComplete={() => form.reset()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.unlockTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("common.unlockDescription", { username: auth?.username ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form id="form-unlock" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup>
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-unlock-password">
                    {t("common.password")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-unlock-password"
                    type="password"
                    placeholder={t("common.placeholderPassword")}
                    autoComplete="current-password"
                    disabled={loading || error}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <AlertDialogFooter>
          <AlertDialogAction
            disabled={loading}
            variant="outline"
            onClick={() => {
              reset();
              logout();
              handle.close();
            }}
          >
            <LogOut /> {t("common.logout")}
          </AlertDialogAction>
          <AlertDialogAction
            form="form-unlock"
            type="submit"
            disabled={loading}
          >
            {loading && <Spinner />}
            {loading || <Key />}
            {t("common.continue")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
