import { LogIn } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useForm, Controller } from 'react-hook-form'
import z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Dialog as BaseDialog } from '@base-ui/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { useState } from "react";
import { getOpaqueConfig, OpaqueClient, OpaqueID, type AuthClient } from "@cloudflare/opaque-ts";
import { KE2 } from "@cloudflare/opaque-ts/lib/src/messages";
import RegisterDialog from "./register";
import { useLocalStorage } from "usehooks-ts";
import { mutate } from "@/lib/swr";
import { argon2id } from "@/workers";
import { useAppDispatch } from "@/stores";
import { set } from "@/stores/key";
import sodium, { from_string, to_base64 } from 'libsodium-wrappers-sumo';
import api from '@/lib/api';
import { aeadDecrypt, kdf } from "@/lib/crypto";


const schema = z.object({
  username: z.string(),
  password: z.string()
});

export default function LoginDialog({
  handle
}: {
  handle: BaseDialog.Handle<void>
}) {
  const [loading, setLoading] = useState(false);
  const [, setRefreshToken] = useLocalStorage('vault-refresh-token', '');
  const dispatch = useAppDispatch();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: '',
      password: ''
    }
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

      const { ke2, loginStateID } = await api.startLogin(data.username, new Uint8Array(req.serialize()));

      const fin = await client.authFinish(
        KE2.deserialize(cfg, Array.from(ke2)),
        'vault',
        data.username
      );

      if (fin instanceof Error) {
        throw fin;
      }

      const { refreshToken, kdf: kdfParams, encryptedPrivateKey, privateKeyNonce } = await api.finishLogin(new Uint8Array(fin.ke3.serialize()), loginStateID);

      toast.success('Successfully logged in');

      const umk = await argon2id({
        iterations: kdfParams.timeCost,
        memorySize: kdfParams.memoryCost * 1024,
        parallelism: kdfParams.parallelism,
        password: from_string(data.password),
        salt: kdfParams.salt,
        hashLength: 32,
      });

      const kek = kdf(umk, 'KEK');

      const privKey = aeadDecrypt(encryptedPrivateKey, kek, privateKeyNonce);

      setRefreshToken(refreshToken);
      dispatch(set({
        umk: to_base64(umk),
        privKey: to_base64(privKey)
      }));

      mutate('self');
      handle.close();
    }
    catch (e) {
      if (e instanceof AxiosError) {
        form.setError('root', {
          type: 'custom',
          message: e.response?.data.error
        })
      }
      else {
        throw e;
      }
    }
    finally {
      setLoading(false);
    }
  }

  return (
    <Dialog handle={handle}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <span className='text-xl'>Login</span>
          </DialogTitle>
          <DialogDescription>
          </DialogDescription>
        </DialogHeader>

        <form id='form-login' onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name='username'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-login-username">
                    Username/Email
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
              )} />
            <Controller
              name='password'
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
                    autoComplete='current-password'
                    type='password'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )} />
          </FieldGroup>
          <div className='w-full flex flex-col gap-2'>
            <div className='flex flex-row justify-end'>
              <span>
                No account yet?
                <RegisterDialog />
              </span>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button type='submit' form='form-login' disabled={loading}>
            {loading && <Spinner />}
            {loading || <LogIn />}
            Login
          </Button>
          <DialogClose render={<Button variant='outline'>Cancel</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
