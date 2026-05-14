import {
  listTrustedSigningKeys,
  serializeSigningPublicKey,
  trustSigningPublicKey,
  type TrustedSigningKey,
} from "@/shared/lib/trusted-signing-keys";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function useTrustedSigningKeys(userId?: number) {
  const [keys, setKeys] = useState<TrustedSigningKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const reload = useCallback(async () => {
    if (userId === undefined) {
      setKeys([]);
      return;
    }

    setIsLoading(true);
    try {
      setKeys(await listTrustedSigningKeys(userId));
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const trustedPublicKeys = useMemo(
    () => new Set(keys.map((key) => key.publicKey)),
    [keys],
  );

  const isTrusted = useCallback(
    (publicKey: Uint8Array) =>
      trustedPublicKeys.has(serializeSigningPublicKey(publicKey)),
    [trustedPublicKeys],
  );

  const trust = useCallback(
    async (owner: string, publicKey: Uint8Array) => {
      if (userId === undefined) return;
      const trustedKey = await trustSigningPublicKey({
        userId,
        owner,
        publicKey,
      });
      setKeys((current) => [
        ...current.filter((key) => key.id !== trustedKey.id),
        trustedKey,
      ]);
    },
    [userId],
  );

  return {
    keys,
    isLoading,
    isTrusted,
    reload,
    trust,
  };
}
