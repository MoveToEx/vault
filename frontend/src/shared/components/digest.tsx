import { useMemo } from "react";
import { pkDigest } from "../lib/trusted-signing-keys";
import Identicon from "identicon.js";
import { Fingerprint } from "lucide-react";
import { Field } from "./ui/field";


export default function Digest({ message }: {
  message: Uint8Array
}) {
  const digest = useMemo(() => {
    return pkDigest(message);
  }, [message]);

  const identicon = useMemo(() => {
    if (!digest) return "";

    return new Identicon(digest.replaceAll(":", ""), {
      background: [255, 255, 255, 0],
      format: "svg",
      margin: 0.16,
      size: 48,
    }).toString();
  }, [digest]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-background">
          {identicon ? (
            <img
              src={`data:image/svg+xml;base64,${identicon}`}
              alt="Signing public key digest identicon"
              className="size-12"
            />
          ) : (
            <Fingerprint className="size-8 text-muted-foreground" />
          )}
        </div>

        <Field className="min-w-0 flex-1 gap-2">
          <p className="break-all font-mono text-xs text-muted-foreground">
            {digest}
          </p>
        </Field>
      </div>
    </div>
  )
}