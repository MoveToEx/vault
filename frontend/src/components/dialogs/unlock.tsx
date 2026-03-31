import useAuth from "@/hooks/use-auth";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { AlertDialog as BaseAlertDialog } from "@base-ui/react";
import z from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { useState } from "react";
import { aeadDecrypt, kdf } from "@/lib/crypto";
import { logout } from "@/lib/utils";
import { argon2id } from "@/workers";
import { useAppDispatch } from "@/stores";
import { set } from "@/stores/umk";
import sodium, { to_base64, from_base64 } from "libsodium-wrappers-sumo";
import { Spinner } from "../ui/spinner";
import { Key, LogOut } from "lucide-react";

const schema = z.object({
  password: z.string()
});

export default function UnlockDialog({ handle }: {
  handle: BaseAlertDialog.Handle<void>
}) {
  const { data: auth, reset, error } = useAuth();
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: '',
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
        parallelism: auth.kdfParallelism,
        password: new TextEncoder().encode(data.password),
        salt: from_base64(auth.kdfSalt),
        hashLength: 32,
      });

      const kek = kdf(umk, 'KEK');

      await sodium.ready;

      aeadDecrypt(
        from_base64(auth.encryptedPrivateKey),
        kek,
        from_base64(auth.privateKeyNonce)
      );

      dispatch(set(to_base64(umk)));

      handle.close();
    }
    catch (e) {
      if (e instanceof Error) {
        form.setError('password', {
          message: e.message,
          type: 'value',
        });
      }
    }
    finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog handle={handle} onOpenChangeComplete={() => form.reset()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Enter password to unlock vault
          </AlertDialogTitle>
          <AlertDialogDescription>
            You're logged in as {auth?.username}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form id='form-unlock' onSubmit={form.handleSubmit(submit)}>
          <FieldGroup>
            <Controller
              name='password'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-unlock-password">
                    Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-unlock-password"
                    type='password'
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading || error}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )} />
          </FieldGroup>
        </form>

        <AlertDialogFooter>
          <AlertDialogAction disabled={loading} variant='outline' onClick={() => {
            reset();
            logout();
            handle.close();
          }}>
            <LogOut /> Logout
          </AlertDialogAction>
          <AlertDialogAction form='form-unlock' type='submit' disabled={loading}>
            {loading && <Spinner />}
            {loading || <Key />}
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}