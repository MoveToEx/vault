import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription } from "@/components/ui/field";
import { useAppDispatch, useAppSelector, useKeys } from "@/stores";
import { FileIcon, Upload } from "lucide-react";
import { useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react";
import { transferBridge } from "@/lib/transfer-bridge";
import { toggleTransferList } from "@/stores/ui";
import DragDrop from "../drag-drop";

const handle = BaseDialog.createHandle();

export default function UploadDialog() {
  const keys = useKeys();
  const dispatch = useAppDispatch();

  const path = useAppSelector((state) => state.path.value);

  const [file, setFile] = useState(null as File | null);

  const submit = async () => {
    if (!file || !keys) return;

    const pathId = path.length === 0 ? 0 : path[path.length - 1].id;

    transferBridge.enqueueUpload(file, pathId, keys.sign.privateKey, keys.kem.publicKey);

    dispatch(toggleTransferList(true));

    handle.close();
  };

  return (
    <Dialog
      handle={handle}
      onOpenChangeComplete={(open) => {
        if (!open) {
          setFile(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Upload /> Upload
          </Button>
        }
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload new file</DialogTitle>
        </DialogHeader>
        <Field className='min-w-0 w-full'>
          {file === null && (
            <DragDrop
              onChange={(f) => {
                if (f.length) {
                  setFile(f[0]);
                }
              }} />
          )}
          {file !== null && (
            <div className='flex flex-col gap-2'>
              <div className='flex flex-row gap-2 items-center'>
                <FileIcon size={16} />
                <span className='min-w-0 shrink truncate'>
                  {file.name}
                </span>
              </div>
            </div>
          )}
          <FieldDescription>
            {`Will upload to ${`/${path.map((it) => it.folderName).join("/")}`}`}
          </FieldDescription>
        </Field>

        <Button onClick={() => submit()}>
          <Upload />
          Upload
        </Button>
      </DialogContent>
    </Dialog>
  );
}
