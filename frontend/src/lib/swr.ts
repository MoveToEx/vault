import useSWR, { mutate as SWRMutate, type SWRConfiguration } from "swr";

export type Tags = "file" | "user" | "self" | "share";

export type Params<T extends unknown[] = [], R = unknown> = {
  id: string;
  args: T;
  fetcher: (...args: T) => Promise<R>;
  tags: Tags[];
  immutable?: boolean;
  config?: SWRConfiguration;
};

function exclude<T>(obj: T, key: keyof T) {
  const { [key]: _, ...result } = obj;
  return result;
}

export default function useTaggedSWR<Args extends unknown[], Result>(
  params: Params<Args, Result>,
) {
  return useSWR<Result>(
    exclude(params, "fetcher"),
    async ({ args }: Exclude<Params<Args, Result>, "fetcher">) => {
      const result = await params.fetcher(...args);
      return result;
    },
    params.config,
  );
}

export function mutate(...tags: [Tags, ...Tags[]]) {
  return SWRMutate((key: Params) => {
    return tags.every((tag) => key?.tags.includes(tag)) && !key.immutable;
  });
}
