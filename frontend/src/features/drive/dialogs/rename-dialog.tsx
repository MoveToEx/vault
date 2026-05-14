import { Dialog as BaseDialog } from "@base-ui/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Check, X } from "lucide-react";
import { z } from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { useKeys } from "@/shared/stores";
import { useEffect, useState } from "react";
import api from "@/shared/lib/api";
import { mutate } from "@/shared/lib/swr";
import { Spinner } from "@/shared/components/ui/spinner";
import { toast } from "sonner";
import { formatError } from "@/shared/lib/utils";
import { Envelope } from "@/shared/lib/crypto_wrappers";

export type RenameDialogPayload = {
  type: "folder" | "file";
  name: string;
  id: number;
  kemCipher: Uint8Array,
  envelope: Uint8Array,
};

const schema = z.object({
  name: z.string().trim().min(1),
});

export default function RenameDialog({
  handle,
}: {
  handle: BaseDialog.Handle<RenameDialogPayload>;
}) {

  return (
    <Dialog handle={handle}>
      {function Content({ payload }) {
        const keys = useKeys();
        const [loading, setLoading] = useState(false);
        const form = useForm<z.infer<typeof schema>>({
          resolver: zodResolver(schema),
          defaultValues: {
            name: payload?.name ?? "",
          },
        });

        useEffect(() => {
          form.reset({
            name: payload?.name ?? "",
          });
        }, [payload?.name, form]);

        const submit = async (data: z.infer<typeof schema>) => {
          if (!payload || !keys) return;
          
          setLoading(true);
          try {
            const metadata = Envelope.decrypt(payload.envelope, payload.kemCipher, keys.sign.publicKey, keys.kem.privateKey);

            const cipher = Envelope.replace(payload.kemCipher, {
              ...metadata,
              name: data.name
            }, keys.sign.privateKey, keys.kem.privateKey);

            if (payload.type === "file") {
              await api.renameFile(payload.id, cipher);
            } else {
              await api.renameFolder(payload.id, cipher);
            }

            await mutate("file");
            handle.close();
            toast.success("Saved");
          } catch (e) {
            form.setError("root", {
              type: "custom",
              message: formatError(e),
            });
          } finally {
            setLoading(false);
          }
        };

        return (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {`Rename ${payload?.type === "folder" ? "folder" : "file"}`}
              </DialogTitle>
            </DialogHeader>

            <form id="form-rename" onSubmit={form.handleSubmit(submit)}>
              <FieldGroup>
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-rename-name">
                        Name
                      </FieldLabel>
                      <Input
                        {...field}
                        id="form-rename-name"
                        disabled={loading}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </form>

            <DialogFooter>
              <Button type="submit" form="form-rename" disabled={loading}>
                {loading ? <Spinner /> : <Check />}
                Save
              </Button>
              <DialogClose
                render={
                  <Button variant="outline" disabled={loading}>
                    <X />
                    Cancel
                  </Button>
                }
              />
            </DialogFooter>
          </DialogContent>
        );
      }}
    </Dialog>
  );
}
