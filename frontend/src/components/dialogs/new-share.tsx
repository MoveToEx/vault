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
import { useKeys } from "@/stores";
import { Alert, AlertDescription } from "../ui/alert";
import useUsers from "@/hooks/use-users";
import { Spinner } from "../ui/spinner";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { formatError } from "@/lib/utils";
import { Envelope, PublicShare } from "@/lib/crypto_wrappers";

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

  return (
    <Dialog handle={handle}>
      {({ payload }) => (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <span className="text-xl">Public share link</span>
            </DialogTitle>
          </DialogHeader>

          <div className='mb-2 flex flex-row items-center gap-2'>
            <Input className='flex-1' readOnly value={payload?.link} />

            <Button size='icon-sm' onClick={async () => {
              await navigator.clipboard.writeText(payload?.link ?? '');
              toast.success("Copied to clipboard");
            }}>
              <Copy size={16} />
            </Button>
          </div>

          <Alert className="border-0">
            <Info />
            <AlertDescription>
              <p>{"Store this link safely. You will not be able to see it again."}</p>
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <DialogClose
              render={<Button>Done</Button>}
            />
          </DialogFooter>
        </DialogContent>
      )}

    </Dialog>
  )
}

function PrivateShareTab({ fileId, handle }: { fileId: number, handle: BaseDialog.Handle<Payload> }) {

  const keys = useKeys();
  const [loading, setLoading] = useState(false);

  const submit = async (data: z.infer<typeof schema>) => {
    if (!keys) return;

    setLoading(true);

    try {
      const file = await api.getFile(fileId);

      const plaintext = Envelope.decrypt(file.envelope, file.kemCipher, keys.sign.publicKey, keys.kem.privateKey);

      const { kemPub } = await api.getUser(data.receiver);

      const [kemCipher, envelope] = Envelope.encrypt(plaintext, keys.sign.privateKey, kemPub);

      await api.createShare({
        kemCipher,
        envelope,
        fileId,
        receiver: data.receiver,
      });

      handle.close();
      toast.success("Created");
    } catch (e) {
      console.log(e);
      form.setError("root", {
        type: 'custom',
        message: formatError(e)
      });
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
                  Receiver username
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
            <p>{"By sharing, your file encryption key will be revealed to the other party."}</p>
            <p>{"They may still decrypt your files offline after expiration if they have downloaded the raw ciphertext."}</p>
            <p>{"There is no way to revoke such offline access. Proceed with care."}</p>
          </AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button type="submit" form="form-share">
          <Share2 /> Create
        </Button>
        <DialogClose
          render={<Button variant="outline">Cancel</Button>}
        />
      </DialogFooter>
    </div>
  );
}

function PublicShareTab({ fileId, handle }: { fileId: number, handle: BaseDialog.Handle<Payload> }) {

  const keys = useKeys();
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!keys) return;

    setLoading(true);

    try {
      const file = await api.getFile(fileId);

      const plaintext = Envelope.decrypt(file.envelope, file.kemCipher, keys.sign.publicKey, keys.kem.privateKey);

      if (plaintext.type !== 'file') return;

      const [sk, kemCipher, envelope] = PublicShare.encrypt(plaintext, keys.sign.privateKey)

      const result = await api.createPublicShare({
        kemCipher,
        envelope,
        fileId,
      });

      const url = new URL(`/ps/${result.key}`, `${window.location.protocol}//${window.location.host}`);

      url.hash = '#' + sk;

      toast.success("Created");

      handle.close();
      linkHandle.openWithPayload({ link: url.toString() });
    } catch (e) {
      toast.error(`Failed: ${formatError(e)}`);
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
            <p>{"A public share exposes the file to anyone with the link."}</p>
            <p className='text-destructive'>Private share should always be preferred over public share when possible.</p>
          </AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button disabled={loading} onClick={() => submit()}>
          <Share2 /> Create
        </Button>
        <DialogClose
          render={
            <Button variant="outline">
              Cancel
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

  return (
    <Fragment>
      <PublicLinkDialog handle={linkHandle} />
      <Dialog handle={handle}>
        {function Content({ payload }) {
          if (!payload) return <></>

          return (
            <DialogContent>
              <DialogHeader className='min-w-0 w-full'>
                <DialogTitle>
                  <span className="text-xl">Share files</span>
                </DialogTitle>
                <DialogDescription>
                  <div className='pt-2 flex flex-row gap-2 items-center'>
                    <File size={16} className='shrink-0' />
                    <span className='truncate'>
                      {`Will share ${payload.name}`}
                    </span>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue='private' >
                <TabsList className='w-full mb-4'>
                  <TabsTrigger value='private'>Private</TabsTrigger>
                  <TabsTrigger value='public'>Public</TabsTrigger>
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
                      <Spinner /> {"Loading…"}
                    </Autocomplete.Item>
                  )}
                  {!isLoading && data && data.length === 0 && (
                    <Autocomplete.Item
                      disabled
                      className="hover:bg-accent hover:text-accent-foreground focus:**:text-accent-foreground gap-2 rounded-sm px-2 py-1.5 text-sm [&_svg:not([class*='size-'])]:size-4 group/dropdown-menu-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0"
                    >
                      <i>No result found</i>
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
