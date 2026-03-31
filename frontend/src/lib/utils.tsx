import { store } from "@/stores";
import { reset as resetPath } from "@/stores/path";
import { clear } from "@/stores/transfer";
import { set } from "@/stores/umk";
import { clsx, type ClassValue } from "clsx"
import { FileArchive, FileCode, FileCog, FileIcon, FileImage, FileMusic, FilePen, FilePlay } from "lucide-react";
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function base64ToArray(s: string) {
  const padding = "=".repeat((4 - s.length % 4) % 4)
  const base64 = (s + padding).replace(/-/g, "+").replace(/_/g, "/")

  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i)
  }
  return arr
}

export function formatSize(size: number) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB', 'RiB', 'QiB'];
  let i = 0;
  while (size >= 1024) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(2)} ${units[i]}`;
}

export function logout() {
  store.dispatch(set(''));
  store.dispatch(resetPath());
  store.dispatch(clear());
}

export function endsWith(str: string, suffix: string[]) {
  return suffix.some(it => str.endsWith(it));
}

export function getIcon(name: string) {
  name = name.toLowerCase();

  if (endsWith(name, ['.rar', '.zip', '.zipx', '.7z', '.tar', '.gz', '.gz.zip', '.tar.bz'])) {
    return <FileArchive size={16} className='inline mx-2' />;
  }
  else if (endsWith(name, ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.jiff', '.apng', '.webp'])) {
    return <FileImage size={16} className='inline mx-2' />
  }
  else if (endsWith(name, [
    '.c', '.cpp', '.cxx', '.ts', '.tsx', '.js', '.jsx',
    '.java', '.kt', '.lock', '.html',
    '.rs', '.go', '.py'
  ])) {
    return <FileCode size={16} className='inline mx-2' />;
  }
  else if (endsWith(name, ['.pdf', '.doc', '.docx', '.dot', '.ppt', '.pptx', '.xls', '.csv', '.md', '.txt'])) {
    return <FilePen size={16} className='inline mx-2' />
  }
  else if (endsWith(name, ['.mp3', '.flac', '.aac', '.ogg'])) {
    return <FileMusic size={16} className='inline mx-2' />
  }
  else if (endsWith(name, ['.mp4', '.mkv', '.webm'])) {
    return <FilePlay size={16} className='inline mx-2' />
  }
  else if (endsWith(name, ['.json', '.yml', '.yaml', '.ini', '.toml'])) {
    return <FileCog size={16} className='inline mx-2' />
  }
  return <FileIcon size={16} className='inline mx-2' />
}