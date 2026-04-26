import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import useTaggedSWR from "@/lib/swr";
import { formatError, formatSize } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { useEffect, useMemo } from "react";
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
import { useTranslation } from "react-i18next";

type SiteConfigFormValues = {
  uploadExpiryMinutes: number;
  registrationOpen: boolean;
  defaultCapacityGiB: number;
};

export default function AdminSiteConfigPage() {
  const { t } = useTranslation();

  const siteConfigSchema = useMemo(
    () =>
      z.object({
        uploadExpiryMinutes: z.coerce
          .number()
          .min(1, t("common.minUploadMinutes"))
          .max(10080, t("common.maxUploadMinutes")),
        registrationOpen: z.boolean(),
        defaultCapacityGiB: z.coerce
          .number()
          .min(1, t("common.minDefaultGib"))
          .max(1024, t("common.maxDefaultGib")),
      }),
    [t],
  );

  const siteConfigResolver = useMemo(
    () => zodResolver(siteConfigSchema) as Resolver<SiteConfigFormValues>,
    [siteConfigSchema],
  );

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
      toast.success(t("common.siteConfigSaved"));
      await mutate();
    } catch (e) {
      form.setError("root", {
        type: "custom",
        message: formatError(e),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> {t("common.loadingSiteConfig")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        {t("common.couldNotLoadSiteConfig")}
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
                {t("common.incompleteUploadExpiry")}
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
                {t("common.incompleteUploadExpiryHint")}
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
                {t("common.allowRegistration")}
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
                {t("common.defaultStorageNewUsers")}
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
                {t("common.defaultStorageHint", {
                  size: formatSize(data.defaultUserCapacityBytes),
                })}
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
        {saving ? t("common.savingChanges") : t("common.saveChanges")}
      </Button>
    </form>
  );
}
