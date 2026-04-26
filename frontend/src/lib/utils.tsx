import { store } from "@/stores";
import { reset as resetPath } from "@/stores/path";
import { clear } from "@/stores/transfer";
import { reset } from "@/stores/key";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AxiosError } from "axios";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function base64ToArray(s: string) {
  const padding = "=".repeat((4 - (s.length % 4)) % 4);
  const base64 = (s + padding).replace(/-/g, "+").replace(/_/g, "/");

  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

export function formatSize(size: number) {
  const units = [
    "B",
    "KiB",
    "MiB",
    "GiB",
    "TiB",
    "PiB",
    "EiB",
    "ZiB",
    "YiB",
    "RiB",
    "QiB",
  ];
  let i = 0;
  while (size >= 1024) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(2)} ${units[i]}`;
}

export function formatError(e: unknown) {
  let message = 'unknown error';

  if (e instanceof AxiosError) {
    message = e.response?.data?.error ?? e.response?.statusText ?? 'unknown error';
  } else if (e instanceof Error) {
    message = e.message;
  }

  return message;
}

export function logout() {
  store.dispatch(reset());
  store.dispatch(resetPath());
  store.dispatch(clear());
}
