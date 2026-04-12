import { LogIn } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useForm, Controller } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { useState } from "react";
import {
  getOpaqueConfig,
  OpaqueClient,
  OpaqueID,
  type AuthClient,
} from "@cloudflare/opaque-ts";
import { KE2 } from "@cloudflare/opaque-ts/lib/src/messages";
import { useLocalStorage } from "usehooks-ts";
import { mutate } from "@/lib/swr";
import { argon2id } from "@/workers";
import { useAppDispatch, useAppSelector } from "@/stores";
import { set } from "@/stores/key";
import { toggleLoginDialog, toggleRegisterDialog } from "@/stores/ui";
import sodium, { from_string, to_base64 } from "libsodium-wrappers-sumo";
import api from "@/lib/api";
import { aeadCompositeDecrypt, kdf } from "@/lib/crypto";
import { useTranslation } from "react-i18next";

const schema = z.object({
  username: z.string(),
  password: z.string(),
});

export default function LoginDialog() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [, setRefreshToken] = useLocalStorage("vault-refresh-token", "");
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.loginDialogOpen);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);

    await sodium.ready;

    const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);
    const client: AuthClient = new OpaqueClient(cfg);

    try {
      const req = await client.authInit(data.password);

      if (req instanceof Error) {
        throw req;
      }

      const { ke2, loginStateID } = await api.startLogin(
        data.username,
        new Uint8Array(req.serialize()),
      );

      const fin = await client.authFinish(
        KE2.deserialize(cfg, Array.from(ke2)),
        "vault",
        data.username,
      );

      if (fin instanceof Error) {
        throw fin;
      }

      const {
        refreshToken,
        kdf: kdfParams,
        encryptedPrivateKey,
        publicKey
      } = await api.finishLogin(
        new Uint8Array(fin.ke3.serialize()),
        loginStateID,
      );

      toast.success(t("common.loginSuccess"));

      const umk = await argon2id({
        iterations: kdfParams.timeCost,
        memorySize: kdfParams.memoryCost * 1024,
        parallelism: kdfParams.parallelism,
        password: from_string(data.password),
        salt: kdfParams.salt,
        hashLength: 32,
      });

      const kek = kdf(umk, "KEK");

      const privKey = aeadCompositeDecrypt(encryptedPrivateKey, kek);

      setRefreshToken(refreshToken);
      dispatch(
        set({
          umk: to_base64(umk),
          privKey: to_base64(privKey),
          pubKey: to_base64(publicKey)
        }),
      );

      mutate("self");
      dispatch(toggleLoginDialog(false));
    } catch (e) {
      if (e instanceof AxiosError) {
        form.setError("root", {
          type: "custom",
          message: e.response?.data.error,
        });
      } else {
        throw e;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => dispatch(toggleLoginDialog(next))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <span className="text-xl">{t("common.login")}</span>
          </DialogTitle>
          <DialogDescription>{t("common.loginDescription")}</DialogDescription>
        </DialogHeader>

        <form id="form-login" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="username"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-login-username">
                    {t("common.usernameOrEmail")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-login-username"
                    placeholder={t("common.placeholderEmail")}
                    autoComplete="username"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-login-password">
                    {t("common.password")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-login-password"
                    placeholder={t("common.placeholderPassword")}
                    autoComplete="current-password"
                    type="password"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          {form.formState.errors.root && (
            <FieldError errors={[form.formState.errors.root]} />
          )}
          <div className="w-full flex flex-col gap-2">
            <div className="flex flex-row justify-end">
              <span>
                {t("common.noAccountYet")}
                <Button
                  variant="link"
                  type="button"
                  onClick={() => {
                    dispatch(toggleLoginDialog(false));
                    dispatch(toggleRegisterDialog(true));
                  }}
                >
                  {t("common.register")}
                </Button>
              </span>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button type="submit" form="form-login" disabled={loading}>
            {loading && <Spinner />}
            {loading || <LogIn />}
            {t("common.login")}
          </Button>
          <DialogClose
            render={<Button variant="outline">{t("common.cancel")}</Button>}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
