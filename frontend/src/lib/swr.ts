import useSWR, { mutate as SWRMutate, type SWRConfiguration } from "swr";
import instance from "./axios";

export type Tags = 'file' | 'user' | 'self';

type BaseParams = {
  tags: Tags[],
  disabled?: boolean,
  immutable?: boolean,
  config?: SWRConfiguration
}

export type GetParams = BaseParams & {
  type: 'GET',
  url: string,
  query?: Record<string, string>,
};

export type PostParams = BaseParams & {
  type: 'POST',
  url: string,
  query?: Record<string, string>,
  payload?: unknown,
}

export type CustomParams<T extends unknown[], R> = BaseParams & {
  type: '$custom',
  args: T,
  fetcher: (...args: T) => Promise<R>,
}

type Params<T extends unknown[] = unknown[], R = unknown> = GetParams | PostParams | CustomParams<T, R>;

const fetcher = async <T extends unknown[], R>(params: Params<T, R>) => {
  if (params.disabled) {
    return null;
  }
  if (params.type === '$custom') {
    const response = await params.fetcher(...params.args);
    return response;
  }
  else if (params.type === 'GET') {
    const query = new URLSearchParams(params.query);
    const s = query.toString();

    const response = await instance.get(params.url + (s.length === 0 ? '' : '?' + s));

    return response.data.data;
  }
  else if (params.type === 'POST') {
    const query = new URLSearchParams(params.query);
    const s = query.toString();

    const response = await instance.post(params.url + (s.length === 0 ? '' : '?' + s), params.payload);

    return response.data.data;
  }
}

function exclude<T>(obj: T, key: keyof T) {
  const { [key]: _, ...result } = obj;
  return result;
}

export default function useTaggedSWR<Args extends unknown[], Result>(params: Params<Args, Result>) {
  return useSWR<Result>(
    params.type === '$custom' ? exclude(params, 'fetcher') : params,
    params.type === '$custom' ? (args: Exclude<CustomParams<Args, Result>, 'fetcher'>) => params.fetcher(...args.args) : fetcher,
    params.config
  );
}

export function mutate(...tags: [Tags, ...Tags[]]) {
  return SWRMutate((key: Params) => {
    return tags.every(tag => key?.tags.includes(tag)) && !key.immutable
  });
}