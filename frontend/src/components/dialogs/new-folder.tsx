import { Check, Plus, X } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { z } from "zod";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { useAppSelector } from "@/stores";
import { seal } from "@/lib/crypto";
import { from_base64, from_string, ready } from "libsodium-wrappers-sumo";
import api from "@/lib/api";
import { useState } from "react";
import { AxiosError } from "axios";
import { Spinner } from "../ui/spinner";
import { mutate } from "@/lib/swr";
import { Dialog as BaseDialog } from "@base-ui/react";

const schema = z.object({
  name: z.string().nonempty(),
});

const handle = BaseDialog.createHandle();

export default function NewFolderDialog() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
    },
  });
  const keys = useAppSelector((state) => state.key.value);
  const path = useAppSelector((state) => state.path.value);

  const [loading, setLoading] = useState(false);

  const submit = async (data: z.infer<typeof schema>) => {
    if (!keys) return;

    setLoading(true);

    try {
      await ready;

      const metadata = seal(
        from_string(JSON.stringify({
          name: data.name,
          type: "folder",
        })),
        from_base64(keys.pubKey),
      );

      const parentId = path.length === 0 ? 0 : path[path.length - 1].id;

      await api.newFolder(parentId, metadata);

      handle.close();
      mutate("file");
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
    <Dialog handle={handle}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Plus /> New Folder
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
        </DialogHeader>
        <form id="form-new-folder" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-new-folder-name">
                    Folder name
                  </FieldLabel>
                  <Input {...field} id="form-new-folder-name" />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="submit" form="form-new-folder" disabled={loading}>
            {loading && <Spinner />}
            {loading || <Check />}
            Confirm
          </Button>

          <DialogClose
            render={
              <Button variant="outline">
                <X />
                Cancel
              </Button>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
