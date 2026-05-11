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
import { useAppSelector, useKeys } from "@/stores";
import api from "@/lib/api";
import { useMemo, useState } from "react";
import { Spinner } from "../ui/spinner";
import { mutate } from "@/lib/swr";
import { Dialog as BaseDialog } from "@base-ui/react";
import { useTranslation } from "react-i18next";
import { formatError } from "@/lib/utils";
import { Envelope } from "@/lib/crypto_wrappers";

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
  const keys = useKeys();
  const path = useAppSelector((state) => state.path.value);

  const [loading, setLoading] = useState(false);

  const submit = async (data: NewFolderValues) => {
    if (!keys) return;

    setLoading(true);

    try {
      const [kemCipher, envelope] = Envelope.encrypt({
        name: data.name,
        type: 'folder'
      }, keys.sign.privateKey, keys.kem.publicKey);

      const parentId = path.length === 0 ? 0 : path[path.length - 1].id;

      await api.newFolder(parentId, { envelope, kemCipher });

      handle.close();
      mutate("file");
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
