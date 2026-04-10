import { Dialog as BaseDialog } from "@base-ui/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Check, X } from "lucide-react";
import { z } from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { useAppSelector } from "@/stores";
import { useEffect, useState } from "react";
import { seal } from "@/lib/crypto";
import { from_base64, from_string, ready } from "libsodium-wrappers-sumo";
import api from "@/lib/api";
import { mutate } from "@/lib/swr";
import { AxiosError } from "axios";
import { Spinner } from "../ui/spinner";
import { toast } from "sonner";

export type RenameDialogPayload = {
  type: "folder" | "file";
  id: number;
  name: string;
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
        const keys = useAppSelector((state) => state.key.value);
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
          if (!payload?.id || !payload?.type || !keys) return;

          setLoading(true);
          try {
            await ready;

            const metadata = seal(
              from_string(
                JSON.stringify({
                  type: payload.type,
                  name: data.name,
                }),
              ),
              from_base64(keys.pubKey),
            );

            if (payload.type === "file") {
              console.log('before invoke')
              await api.renameFile(payload.id, metadata);
            } else {
              await api.renameFolder(payload.id, metadata);
            }

            await mutate("file");
            handle.close();
            toast.success('Saved');
          } catch (e) {
            if (e instanceof AxiosError) {
              form.setError("root", {
                type: "custom",
                message: e.response?.data?.error,
              });
            } else {
              throw e;
            }
          } finally {
            setLoading(false);
          }
        };

        return (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Rename {payload?.type === "folder" ? "Folder" : "File"}
              </DialogTitle>
            </DialogHeader>

            <form id="form-rename" onSubmit={form.handleSubmit(submit)}>
              <FieldGroup>
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-rename-name">Name</FieldLabel>
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
