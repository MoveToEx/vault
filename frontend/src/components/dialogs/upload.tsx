import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/stores"
import { from_base64 } from "libsodium-wrappers-sumo";
import { Upload } from "lucide-react";
import { useState } from "react";
import { Dialog as BaseDialog } from '@base-ui/react';
import { transferBridge } from "@/lib/transfer-bridge";
import { toggleTransferList } from "@/stores/ui";

const handle = BaseDialog.createHandle();

export default function UploadDialog() {
  const umk = useAppSelector(state => state.umk.value);
  const dispatch = useAppDispatch();

  const path = useAppSelector(state => state.path.value);

  const [file, setFile] = useState(null as File | null);

  const submit = async () => {
    if (!file || !umk) return;

    const pathId = path.length === 0 ? 0 : path[path.length - 1].id;

    transferBridge.enqueueUpload(file, pathId, from_base64(umk));

    dispatch(toggleTransferList(true));

    handle.close();
  }

  return (
    <Dialog
      handle={handle}
      onOpenChangeComplete={(open) => {
        if (!open) {
          setFile(null);
        }
      }}>
      <DialogTrigger render={
        <Button>
          <Upload /> Upload
        </Button>
      } />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Upload New File
          </DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor='upload-input'>
            File
          </FieldLabel>
          <Input
            id='upload-input'
            type='file'
            onChange={e => {
              if (!e.target.files) return;

              setFile(e.target.files[0]);
            }}
          />
          <FieldDescription>
            Will upload to /
            {
              path.map(it => it.folderName).join('/')
            }
          </FieldDescription>
        </Field>

        <Button onClick={() => submit()}>
          <Upload />
          Upload
        </Button>
      </DialogContent>
    </Dialog>
  )
}