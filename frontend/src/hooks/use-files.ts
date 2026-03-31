import useTaggedSWR from "@/lib/swr";

type Item = {
  id: number,
  encryptedMetadata: string;
  nonce: string;
  size: number;
}

export default function useFiles(dir: number) {
  return useTaggedSWR<[], Item[]>({
    type: 'GET',
    tags: ['file', 'self'],
    url: '/files',
    query: {
      dir: dir.toString()
    },
  });
}