import { useForm, Controller } from 'react-hook-form'
import z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Dialog as BaseDialog } from '@base-ui/react'
import { Button } from "@/components/ui/button";
import api from '@/lib/api';
import { toast } from "sonner";
import { AxiosError } from "axios";
import { useState } from 'react'
import { ChevronDown, ChevronUp, User } from 'lucide-react'
import { Spinner } from '../ui/spinner';
import { OpaqueClient, OpaqueID, RegistrationResponse, getOpaqueConfig, type RegistrationClient } from '@cloudflare/opaque-ts';
import { Slider } from '../ui/slider';
import { aeadComposite, kdf } from '@/lib/crypto'
import { argon2id } from '@/workers'
import sodium from 'libsodium-wrappers-sumo'
import { mutate } from '@/lib/swr'

const registerSchema = z.object({
  email: z.email(),
  username: z.string()
    .min(6, 'Username should be no shorter than 6 characters')
    .max(32, 'Username should be no longer than 32 characters')
    .regex(/^[a-zA-Z0-9]+$/, 'Only digits and letters are allowed'),
  password: z.string()
    .min(8, 'Password should be at lease 8 characters')
    .max(128, 'Password should be at most 128 characters'),
  confirmPassword: z.string()
    .min(8, 'Password should be at lease 8 characters')
    .max(128, 'Password should be at most 128 characters'),
  kdfMemoryCost: z.number().min(64).max(1024),
  kdfTimeCost: z.number().min(1).max(100),
  kdfParallelism: z.number().min(1).max(4),
});

const registerHandle = BaseDialog.createHandle();

export default function RegisterDialog() {
  const [loading, setLoading] = useState(false);
  const [showKDF, setShowKDF] = useState(false);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
      kdfMemoryCost: 128,
      kdfTimeCost: 3,
      kdfParallelism: 1,
    },
    disabled: loading
  });

  const onSubmit = async (data: z.infer<typeof registerSchema>) => {
    await sodium.ready;

    if (data.confirmPassword !== data.password) {
      form.setError('confirmPassword', {
        type: 'validate',
        message: 'Passwords do not match'
      });
      return;
    }

    setLoading(true);

    const cfg = getOpaqueConfig(OpaqueID.OPAQUE_P256);

    try {
      const client: RegistrationClient = new OpaqueClient(cfg);

      const req = await client.registerInit(data.password);

      if (req instanceof Error) {
        throw req;
      }

      const message = await api.startRegistration(data.username, req.serialize());

      const fin = await client.registerFinish(
        RegistrationResponse.deserialize(cfg, Array.from(message)),
        'vault',
        data.username,
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
        password: new TextEncoder().encode(data.password),
        salt,
        hashLength: 32,
      });

      const kek = kdf(umk, 'KEK');

      const rootMetadata = aeadComposite(JSON.stringify({
        type: 'folder',
        name: '/'
      }), kek);

      const { publicKey, privateKey } = sodium.crypto_box_keypair();

      const epk = aeadComposite(privateKey, kek);

      await api.completeRegistration({
        email: data.email,
        username: data.username,
        opaqueRecord: new Uint8Array(fin.record.serialize()),
        publicKey,
        privateKey: epk,
        rootMetadata,
        kdf: {
          salt,
          memoryCost: data.kdfMemoryCost,
          timeCost: data.kdfTimeCost,
          parallelism: data.kdfParallelism,
        }
      });

      toast.success('Signed up');
      registerHandle.close();

      mutate('file');
    }
    catch (e) {
      if (e instanceof AxiosError) {
        form.setError('root', {
          type: 'custom',
          message: e.response?.data.error
        });
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
    <Dialog
      handle={registerHandle}
      onOpenChangeComplete={() => {
        form.reset();
      }}>
      <DialogTrigger render={
        <Button variant='link'>
          Register
        </Button>
      } />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <span className='text-xl'>Register</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={e => {
          e.stopPropagation();

          form.handleSubmit(onSubmit)(e);
        }}>
          <FieldGroup>
            <Controller
              name='email'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-register-email">
                    Email
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-register-email"
                    placeholder="user@example.com"
                    autoComplete="email"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )} />
            <Controller
              name='username'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-register-username">
                    Username
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-register-username"
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
                  <FieldLabel htmlFor="form-register-password">
                    Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-register-password"
                    placeholder="••••••••"
                    autoComplete='new-password'
                    type='password'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )} />
            <Controller
              name='confirmPassword'
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-register-confirm-password">
                    Confirm Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-register-confirm-password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    type='password'
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )} />
          </FieldGroup>

          <div className='w-full flex flex-row justify-end items-center'>
            <Button variant='link' onClick={() => {
              setShowKDF(val => !val);
            }}>
              {showKDF && <ChevronUp />}
              {showKDF || <ChevronDown />}
              Advanced
            </Button>
          </div>

          {showKDF && (
            <FieldSet>
              <FieldLegend>KDF</FieldLegend>

              <FieldGroup>
                <Controller
                  name='kdfTimeCost'
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel className='flex flex-row justify-between items-center' htmlFor="form-register-kdf-timecost">
                        <span>
                          Time cost
                        </span>
                        <span>
                          {field.value}
                        </span>
                      </FieldLabel>
                      <Slider
                        {...field}
                        id="form-register-kdf-timecost"
                        className="mx-auto w-full max-w-xs h-1"
                        onValueChange={field.onChange}
                        step={1}
                        min={1}
                        max={10} />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  name='kdfMemoryCost'
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel className='flex flex-row justify-between items-center' htmlFor="form-register-kdf-memcost">
                        <span>
                          Memory cost
                        </span>
                        <span>
                          {field.value} MiB
                        </span>
                      </FieldLabel>
                      <Slider
                        {...field}
                        id="form-register-kdf-memcost"
                        className="mx-auto w-full max-w-xs h-1"
                        onValueChange={field.onChange}
                        step={64}
                        min={64}
                        max={1024} />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  name='kdfParallelism'
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel className='flex flex-row justify-between items-center' htmlFor="form-register-kdf-parallel">
                        <span>
                          Parallelism
                        </span>
                        <span>
                          {field.value}
                        </span>
                      </FieldLabel>
                      <Slider
                        {...field}
                        id="form-register-kdf-parallel"
                        className="mx-auto w-full max-w-xs h-1"
                        onValueChange={field.onChange}
                        step={1}
                        min={1}
                        max={4} />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

              </FieldGroup>

            </FieldSet>
          )}

          <div className='flex flex-row justify-end'>
            <span>
              Already have an account?
              <DialogClose render={
                <Button variant='link'>
                  Go back to login
                </Button>
              } />
            </span>
          </div>

          <DialogFooter>
            <Button type='submit' disabled={loading}>
              {loading || <User />}
              {loading && <Spinner />}
              Register
            </Button>
            <DialogClose render={<Button variant='outline'>Cancel</Button>} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}