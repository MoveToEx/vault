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
import { AxiosError } from "axios";
import { Spinner } from "../ui/spinner";
import { toast } from "sonner";

export type SetUserCapacityPayload = {
  userId: number;
  username: string;
  /** Current quota in bytes (used to prefill the form). */
  capacityBytes: number;
};

const schema = z.object({
  capacityGiB: z.coerce
    .number()
    .min(1, "Minimum 1 GiB")
    .max(1024, "Maximum 1024 GiB"),
});

type FormValues = z.infer<typeof schema>;

const resolver = zodResolver(schema) as Resolver<FormValues>;

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
        const [loading, setLoading] = useState(false);

        const form = useForm<FormValues>({
          resolver,
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
            toast.success("Capacity updated.");
            handle.close();
            await onSaved?.();
          } catch (e) {
            if (e instanceof AxiosError) {
              form.setError("root", {
                type: "custom",
                message:
                  (e.response?.data as { error?: string } | undefined)?.error ??
                  "Could not update capacity.",
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
                Storage capacity
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
                        Capacity (GiB)
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
