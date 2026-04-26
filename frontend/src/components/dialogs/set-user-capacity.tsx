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
import z from "zod";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Spinner } from "../ui/spinner";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { formatError } from "@/lib/utils";

export type SetUserCapacityPayload = {
  userId: number;
  username: string;
  /** Current quota in bytes (used to prefill the form). */
  capacityBytes: number;
};

type FormValues = {
  capacityGiB: number;
};

export default function SetUserCapacityDialog({
  handle,
  onSaved,
}: {
  handle: BaseDialog.Handle<SetUserCapacityPayload>;
  onSaved?: () => void | Promise<void>;
}) {
  return (
    <Dialog handle={handle}>
      {function Content({ payload }) {
        const { t } = useTranslation();
        const [loading, setLoading] = useState(false);

        const schema = z.object({
          capacityGiB: z.coerce
            .number()
            .min(1, t("common.minGib"))
            .max(1024, t("common.maxGib")),
        });

        const form = useForm<FormValues>({
          resolver: zodResolver(schema) as Resolver<FormValues>,
          defaultValues: {
            capacityGiB: 1,
          },
        });

        useEffect(() => {
          if (!payload) return;
          form.reset({
            capacityGiB: Number(
              (payload.capacityBytes / 1024 ** 3).toFixed(4),
            ),
          });
        }, [payload, form]);

        const submit = async (values: FormValues) => {
          if (!payload?.userId) return;

          form.clearErrors("root");
          setLoading(true);
          try {
            await api.patchAdminUserCapacity(
              payload.userId,
              Math.round(values.capacityGiB * 1024 ** 3),
            );
            toast.success(t("common.capacityUpdated"));
            handle.close();
            await onSaved?.();
          } catch (e) {
            form.setError("root", {
              type: "custom",
              message: formatError(e)
            });
          } finally {
            setLoading(false);
          }
        };

        return (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("common.storageCapacityTitle")}
                {payload?.username ? ` — ${payload.username}` : ""}
              </DialogTitle>
            </DialogHeader>

            <form
              id="form-set-user-capacity"
              onSubmit={form.handleSubmit(submit)}
            >
              <FieldGroup>
                <Controller
                  name="capacityGiB"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-set-user-capacity-gib">
                        {t("common.capacityGib")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="form-set-user-capacity-gib"
                        type="number"
                        min={1}
                        max={1024}
                        step="0.01"
                        disabled={loading}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                {form.formState.errors.root?.message && (
                  <p className="text-sm text-destructive">
                    {String(form.formState.errors.root.message)}
                  </p>
                )}
              </FieldGroup>
            </form>

            <DialogFooter>
              <Button
                type="submit"
                form="form-set-user-capacity"
                disabled={loading}
              >
                {loading ? <Spinner /> : <Check />}
                {t("common.save")}
              </Button>
              <DialogClose
                render={
                  <Button variant="outline" disabled={loading}>
                    <X />
                    {t("common.cancel")}
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
