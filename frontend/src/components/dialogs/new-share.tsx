import { Autocomplete, Dialog as BaseDialog } from "@base-ui/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import z from "zod";
import { Controller, useForm, type RefCallBack } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Copy, File, Info, Share2 } from "lucide-react";
import { Button } from "../ui/button";
import api from "@/lib/api";
import { useAppSelector } from "@/stores";
import { open, seal } from "@/lib/crypto";
import sodium, { from_base64, to_base64 } from "libsodium-wrappers-sumo";
import { Alert, AlertDescription } from "../ui/alert";
import useUsers from "@/hooks/use-users";
import { Spinner } from "../ui/spinner";
import { Fragment, useState } from "react";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

type Payload = {
  id: number;
  name: string;
};

const schema = z.object({
  receiver: z.string(),
});

type LinkPayload = {
  link: string;
}

const linkHandle = BaseDialog.createHandle<LinkPayload>();

function PublicLinkDialog({ handle }: { handle: BaseDialog.Handle<LinkPayload> }) {
  const { t } = useTranslation();

  return (
    <Dialog handle={handle}>
      {({ payload }) => (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <span className="text-xl">{t("common.publicShareLinkTitle")}</span>
            </DialogTitle>
          </DialogHeader>

          <div className='mb-2 flex flex-row items-center gap-2'>
            <Input className='flex-1' readOnly value={payload?.link} />

            <Button size='icon-sm' onClick={async () => {
              await navigator.clipboard.writeText(payload?.link ?? '');
              toast.success(t("common.copiedToClipboard"));
            }}>
              <Copy size={16} />
            </Button>
          </div>

          <Alert className="border-0">
            <Info />
            <AlertDescription>
              <p>{t("common.publicLinkStoreOnceWarning")}</p>
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <DialogClose
              render={<Button>{t("common.publicShareLinkDone")}</Button>}
            />
          </DialogFooter>
        </DialogContent>
      )}

    </Dialog>
  )
}

function PrivateShareTab({ fileId, handle }: { fileId: number, handle: BaseDialog.Handle<Payload> }) {
  const { t } = useTranslation();

  const keys = useAppSelector((state) => state.key.value);
  const [loading, setLoading] = useState(false);

  const submit = async (data: z.infer<typeof schema>) => {
    if (!keys) return;

    setLoading(true);

    try {
      await sodium.ready;

      const { encryptedKey, encryptedMetadata } = await api.getFile(fileId);

      const pubKey = from_base64(keys.pubKey);
      const privKey = from_base64(keys.privKey);

      const fek = open(from_base64(encryptedKey), pubKey, privKey);
      const metadata = open(
        from_base64(encryptedMetadata),
        pubKey,
        privKey,
      );

      const { publicKey } = await api.getUser(data.receiver);

      await api.createShare({
        encryptedKey: seal(fek, publicKey),
        encryptedMetadata: seal(metadata, publicKey),
        fileId: fileId,
        receiver: data.receiver,
      });

      handle.close();
      toast.success(t("common.shareCreated"));
    } catch (e) {
      if (e instanceof AxiosError) {
        form.setError("root", e.response?.data?.error);
      }
    } finally {
      setLoading(false);
    }
  };
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      receiver: "",
    },
  });
  return (
    <div>
      <form className='pb-2' id="form-share" onSubmit={form.handleSubmit(submit)}>
        <FieldGroup>
          <Controller
            disabled={loading}
            name="receiver"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="form-share-receiver-id">
                  {t("common.receiverUsername")}
                </FieldLabel>
                <UserInput {...field} id="form-share-receiver-id" />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

        </FieldGroup>
      </form>

      <div>
        <Alert className="border-0">
          <Info />
          <AlertDescription>
            <p>{t("common.shareWarning1")}</p>
            <p>{t("common.shareWarning2")}</p>
            <p>{t("common.shareWarning3")}</p>
          </AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button type="submit" form="form-share">
          <Share2 /> {t("common.create")}
        </Button>
        <DialogClose
          render={<Button variant="outline">{t("common.cancel")}</Button>}
        />
      </DialogFooter>
    </div>
  );
}

function PublicShareTab({ fileId, handle }: { fileId: number, handle: BaseDialog.Handle<Payload> }) {
  const { t } = useTranslation();

  const keys = useAppSelector((state) => state.key.value);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!keys) return;

    setLoading(true);

    try {
      await sodium.ready;

      const { encryptedKey, encryptedMetadata } = await api.getFile(fileId);

      const pubKey = from_base64(keys.pubKey);
      const privKey = from_base64(keys.privKey);

      const fek = open(from_base64(encryptedKey), pubKey, privKey);
      const metadata = open(
        from_base64(encryptedMetadata),
        pubKey,
        privKey,
      );

      const keypair = sodium.crypto_box_keypair();

      const result = await api.createPublicShare({
        encryptedKey: seal(fek, keypair.publicKey),
        encryptedMetadata: seal(metadata, keypair.publicKey),
        fileId,
      });

      const url = new URL(`/ps/${result.key}`, `${window.location.protocol}//${window.location.host}`);

      url.searchParams.append('sk', to_base64(keypair.privateKey));
      url.searchParams.append('pk', to_base64(keypair.publicKey));

      toast.success(t("common.shareCreated"));

      handle.close();
      linkHandle.openWithPayload({ link: url.toString() });
    } catch (e) {
      let message = t("common.unknownError");

      if (e instanceof AxiosError) {
        message = e.response?.data?.error ?? e.response?.statusText ?? t("common.unknownError");
      } else if (e instanceof Error) {
        message = e.message;
      }

      toast.error(t("common.failedWithMessage", { message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div>
        <Alert className="border-0">
          <Info />
          <AlertDescription>
            <p>{t("common.publicShareExposesWarning")}</p>
          </AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button disabled={loading} onClick={() => submit()}>
          <Share2 /> {t("common.create")}
        </Button>
        <DialogClose
          render={
            <Button variant="outline">
              {t("common.cancel")}
            </Button>
          }
        />
      </DialogFooter>
    </div>
  );
}

export default function NewShareDialog({
  handle,
}: {
  handle: BaseDialog.Handle<Payload>;
}) {
  const { t } = useTranslation();

  return (
    <Fragment>
      <PublicLinkDialog handle={linkHandle} />
      <Dialog handle={handle}>
        {function Content({ payload }) {
          if (!payload) return <></>

          return (
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  <span className="text-xl">{t("common.shareFiles")}</span>
                </DialogTitle>
                <DialogDescription>
                  <div className='pt-2 w-full flex flex-row gap-2 items-center'>
                    <File size={16} />
                    <span>
                      {t("common.willShare", { name: payload.name })}
                    </span>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue='private' >
                <TabsList className='w-full mb-4'>
                  <TabsTrigger value='private'>{t("common.shareTabPrivate")}</TabsTrigger>
                  <TabsTrigger value='public'>{t("common.shareTabPublic")}</TabsTrigger>
                </TabsList>
                <TabsContent value='private'>
                  <PrivateShareTab
                    handle={handle}
                    fileId={payload.id} />
                </TabsContent>
                <TabsContent value='public'>
                  <PublicShareTab
                    handle={handle}
                    fileId={payload.id}
                  />
                </TabsContent>
              </Tabs>
            </DialogContent>
          );
        }}
      </Dialog>
    </Fragment>
  );
}

type UserInputProps = {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  name: string;
  ref: RefCallBack;
  id: string;
};

function UserInput({ value, onChange, disabled = false }: UserInputProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useUsers(value);

  return (
    <div>
      <div>
        <Autocomplete.Root
          mode="both"
          items={!isLoading ? (data ?? []) : []}
          onValueChange={(val) => {
            onChange(val);
          }}
          value={value}
          itemToStringValue={(it) => it.username}
        >
          <label>
            <Autocomplete.Input
              render={<Input disabled={disabled} value={value} />}
            />
          </label>

          <Autocomplete.Portal>
            <Autocomplete.Positioner className="z-60" sideOffset={4}>
              <Autocomplete.Popup className="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 bg-popover text-popover-foreground min-w-32 rounded-md p-1 shadow-md ring-1 duration-100 z-50 max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto outline-none data-closed:overflow-hidden">
                <Autocomplete.Status>
                  {isLoading && (
                    <Autocomplete.Item
                      disabled
                      className="focus:**:text-accent-foreground gap-2 rounded-sm px-2 py-1.5 text-sm [&_svg:not([class*='size-'])]:size-4 group/dropdown-menu-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0"
                    >
                      <Spinner /> {t("common.loadingAutocomplete")}
                    </Autocomplete.Item>
                  )}
                  {!isLoading && data && data.length === 0 && (
                    <Autocomplete.Item
                      disabled
                      className="hover:bg-accent hover:text-accent-foreground focus:**:text-accent-foreground gap-2 rounded-sm px-2 py-1.5 text-sm [&_svg:not([class*='size-'])]:size-4 group/dropdown-menu-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0"
                    >
                      <i>{t("common.noResultFound")}</i>
                    </Autocomplete.Item>
                  )}
                </Autocomplete.Status>

                <Autocomplete.List>
                  {!!data &&
                    data.map((it) => (
                      <Autocomplete.Item
                        key={it.id}
                        value={it}
                        className="hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground focus:**:text-accent-foreground gap-2 rounded-sm px-2 py-1.5 text-sm [&_svg:not([class*='size-'])]:size-4 group/dropdown-menu-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0"
                      >
                        {it.username}
                      </Autocomplete.Item>
                    ))}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      </div>
    </div>
  );
}
