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
import { File, Info, Share2 } from "lucide-react";
import { Button } from "../ui/button";
import api from "@/lib/api";
import { useAppSelector } from "@/stores";
import { open, seal } from "@/lib/crypto";
import sodium, { from_base64 } from "libsodium-wrappers-sumo";
import { Alert, AlertDescription } from "../ui/alert";
import useUsers from "@/hooks/use-users";
import { Spinner } from "../ui/spinner";
import { useState } from "react";
import { AxiosError } from "axios";
import { toast } from "sonner";

type Payload = {
  id: number;
  name: string;
};

const schema = z.object({
  receiver: z.string(),
});

export default function NewShareDialog({
  handle,
}: {
  handle: BaseDialog.Handle<Payload>;
}) {
  return (
    <Dialog handle={handle}>
      {function Content({ payload }) {
        const keys = useAppSelector((state) => state.key.value);
        const [loading, setLoading] = useState(false);

        const submit = async (data: z.infer<typeof schema>) => {
          if (!payload?.id || !keys) return;

          setLoading(true);

          try {
            await sodium.ready;

            const { encryptedKey, encryptedMetadata } = await api.getFile(
              payload?.id,
            );

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
              fileId: payload.id,
              receiver: data.receiver,
            });

            handle.close();
            toast.success("Created");
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                <span className="text-xl">Share files</span>
              </DialogTitle>
              <DialogDescription></DialogDescription>
            </DialogHeader>

            <form id="form-share" onSubmit={form.handleSubmit(submit)}>
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
                <File />
                <AlertDescription>
                  Will share {payload?.name}
                </AlertDescription>
              </Alert>
              <Alert className="border-0">
                <Info />
                <AlertDescription>
                  <p>
                    By sharing, your file encryption key will be revealed to the
                    other party.
                  </p>
                  <p>
                    This means there exists possibility that the other party can
                    still decrypt your files offline after expiration, if they
                    have downloaded the raw ciphertext of the shared files.
                  </p>
                  <p>There's no way of revoking such access. Be informed.</p>
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button type="submit" form="form-share">
                <Share2 /> Create
              </Button>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
            </DialogFooter>
          </DialogContent>
        );
      }}
    </Dialog>
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
                      <Spinner /> Loading...
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
