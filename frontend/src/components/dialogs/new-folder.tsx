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
import { useMemo, useState } from "react";
import { AxiosError } from "axios";
import { Spinner } from "../ui/spinner";
import { mutate } from "@/lib/swr";
import { Dialog as BaseDialog } from "@base-ui/react";
import { useTranslation } from "react-i18next";

const handle = BaseDialog.createHandle();

type NewFolderValues = { name: string };

export default function NewFolderDialog() {
  const { t } = useTranslation();
  const folderSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("common.minOneChar")),
      }),
    [t],
  );

  const form = useForm<NewFolderValues>({
    resolver: zodResolver(folderSchema),
    defaultValues: {
      name: "",
    },
  });
  const keys = useAppSelector((state) => state.key.value);
  const path = useAppSelector((state) => state.path.value);

  const [loading, setLoading] = useState(false);

  const submit = async (data: NewFolderValues) => {
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
            <Plus /> {t("common.newFolderButton")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("common.createNewFolder")}</DialogTitle>
        </DialogHeader>
        <form id="form-new-folder" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-new-folder-name">
                    {t("common.folderName")}
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
            {t("common.confirm")}
          </Button>

          <DialogClose
            render={
              <Button variant="outline">
                <X />
                {t("common.cancel")}
              </Button>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
