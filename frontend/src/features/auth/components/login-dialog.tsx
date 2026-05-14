import { LogIn } from "lucide-react";
import { Spinner } from "@/shared/components/ui/spinner";
import { useForm, Controller } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import {
  getOpaqueConfig,
  OpaqueClient,
  OpaqueID,
  type AuthClient,
} from "@cloudflare/opaque-ts";
import { KE2 } from "@cloudflare/opaque-ts/lib/src/messages";
import { useLocalStorage } from "usehooks-ts";
import { mutate } from "@/shared/lib/swr";
import { argon2id } from "@/features/transfer/workers";
import { useAppDispatch, useAppSelector } from "@/shared/stores";
import { set } from "@/shared/stores/key";
import { toggleLoginDialog, toggleRegisterDialog } from "@/shared/stores/ui";
import sodium, { from_string, to_base64 } from "libsodium-wrappers";
import api from "@/shared/lib/api";
import { formatError } from "@/shared/lib/utils";
import type { Keypair } from "@/shared/lib/types";
import { PrivateKey } from "@/shared/lib/crypto_wrappers";

const schema = z.object({
  username: z.string(),
  password: z.string(),
});

export default function LoginDialog() {
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
        refreshToken, kdf: kdfParams,
        kemPri, kemPub, sgnPri, sgnPub
      } = await api.finishLogin(
        new Uint8Array(fin.ke3.serialize()),
        loginStateID,
      );

      toast.success("Successfully logged in");

      const umk = await argon2id({
        iterations: kdfParams.timeCost,
        memorySize: kdfParams.memoryCost * 1024,
        password: from_string(data.password),
        salt: kdfParams.salt,
        hashLength: 32,
      });

      const sk = {
        publicKey: sgnPub,
        privateKey: PrivateKey.decrypt(umk, sgnPri),
      } as Keypair;
      
      const kem = {
        publicKey: kemPub,
        privateKey: PrivateKey.decrypt(umk, kemPri)
      } as Keypair;

      setRefreshToken(refreshToken);
      dispatch(
        set({
          umk: to_base64(umk),
          kem: {
            publicKey: to_base64(kem.publicKey),
            privateKey: to_base64(kem.privateKey),
          },
          sign: {
            publicKey: to_base64(sk.publicKey),
            privateKey: to_base64(sk.privateKey),
          },
        }),
      );

      await mutate("self");
      dispatch(toggleLoginDialog(false));
    } catch (e) {
      form.setError("root", {
        type: "custom",
        message: formatError(e)
      });
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
            <span className="text-xl">Login</span>
          </DialogTitle>
          <DialogDescription>Sign in with your username or email and password.</DialogDescription>
        </DialogHeader>

        <form id="form-login" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="username"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-login-username">
                    Username / email
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-login-username"
                    placeholder="user@example.com"
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
                    Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-login-password"
                    placeholder="••••••••"
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
                No account yet?
                <Button
                  variant="link"
                  type="button"
                  onClick={() => {
                    dispatch(toggleLoginDialog(false));
                    dispatch(toggleRegisterDialog(true));
                  }}
                >
                  Register
                </Button>
              </span>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button type="submit" form="form-login" disabled={loading}>
            {loading && <Spinner />}
            {loading || <LogIn />}
            Login
          </Button>
          <DialogClose
            render={<Button variant="outline">Cancel</Button>}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
