import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import useTaggedSWR from "@/lib/swr";
import { formatSize } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { useEffect } from "react";
import { toast } from "sonner";
import z from "zod";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { AxiosError } from "axios";

const siteConfigSchema = z.object({
  uploadExpiryMinutes: z.coerce
    .number()
    .min(1, "Minimum 1 minute")
    .max(10080, "Maximum 7 days (10080 minutes)"),
  registrationOpen: z.boolean(),
  defaultCapacityGiB: z.coerce
    .number()
    .min(1, "Minimum 1 GiB")
    .max(1024, "Maximum 1024 GiB"),
});

type SiteConfigFormValues = z.infer<typeof siteConfigSchema>;

const siteConfigResolver = zodResolver(
  siteConfigSchema,
) as Resolver<SiteConfigFormValues>;

export default function AdminSiteConfigPage() {
  const { data, isLoading, error, mutate } = useTaggedSWR({
    id: "admin-site-config",
    tags: ["admin"],
    args: [],
    fetcher: () => api.getAdminSiteConfig(),
  });

  const form = useForm<SiteConfigFormValues>({
    resolver: siteConfigResolver,
    defaultValues: {
      uploadExpiryMinutes: 180,
      registrationOpen: true,
      defaultCapacityGiB: 2,
    },
  });

  useEffect(() => {
    if (!data) return;
    form.reset({
      uploadExpiryMinutes: Math.round(data.uploadExpirySeconds / 60),
      registrationOpen: data.registrationOpen,
      defaultCapacityGiB: Number(
        (data.defaultUserCapacityBytes / 1024 ** 3).toFixed(2),
      ),
    });
  }, [data, form]);

  const saving = form.formState.isSubmitting;

  const onSubmit = async (values: SiteConfigFormValues) => {
    form.clearErrors("root");
    try {
      await api.patchAdminSiteConfig({
        uploadExpirySeconds: Math.round(values.uploadExpiryMinutes * 60),
        registrationOpen: values.registrationOpen,
        defaultUserCapacityBytes: Math.round(
          values.defaultCapacityGiB * 1024 ** 3,
        ),
      });
      toast.success("Site configuration saved.");
      await mutate();
    } catch (e) {
      if (e instanceof AxiosError) {
        form.setError("root", {
          type: "custom",
          message:
            (e.response?.data as { error?: string } | undefined)?.error ??
            "Could not save configuration.",
        });
      } else {
        throw e;
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        Could not load site configuration.
      </p>
    );
  }

  return (
    <form
      className="max-w-md flex flex-col gap-6 rounded-lg border bg-card p-6 shadow-sm"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FieldGroup>
        <Controller
          name="uploadExpiryMinutes"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="site-config-upload-expiry">
                Incomplete upload expiration (minutes)
              </FieldLabel>
              <Input
                {...field}
                id="site-config-upload-expiry"
                type="number"
                min={1}
                max={10080}
                disabled={saving}
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
              <p className="text-xs text-muted-foreground">
                Upload sessions that are not finished within this window are
                discarded (between 1 minute and 7 days).
              </p>
            </Field>
          )}
        />

        <Controller
          name="registrationOpen"
          control={form.control}
          render={({ field }) => (
            <div className="flex items-center gap-3">
              <input
                id="site-config-reg-open"
                type="checkbox"
                className="size-4 rounded border"
                checked={field.value}
                onChange={field.onChange}
                disabled={saving}
              />
              <Label
                htmlFor="site-config-reg-open"
                className="font-normal cursor-pointer"
              >
                Allow new user registration
              </Label>
            </div>
          )}
        />

        <Controller
          name="defaultCapacityGiB"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="site-config-default-cap">
                Default storage for new users (GiB)
              </FieldLabel>
              <Input
                {...field}
                id="site-config-default-cap"
                type="number"
                min={1}
                max={1024}
                step="0.01"
                disabled={saving}
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
              <p className="text-xs text-muted-foreground">
                Applied to new accounts only. Current:{" "}
                {formatSize(data.defaultUserCapacityBytes)}.
              </p>
            </Field>
          )}
        />

        {form.formState.errors.root?.message && (
          <p className="text-sm text-destructive">
            {String(form.formState.errors.root.message)}
          </p>
        )}
      </FieldGroup>

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
