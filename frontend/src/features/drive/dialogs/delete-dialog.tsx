import {
  AlertDialog as BaseAlertDialog,
} from "@base-ui/react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import api from "@/shared/lib/api";
import { mutate } from "@/shared/lib/swr";

export type Payload = {
  type: "folder" | "file";
  id: number;
  name: string;
}

export default function DeleteDialog({
  handle,
}: {
  handle: BaseAlertDialog.Handle<Payload>;
}) {

  return (
    <AlertDialog handle={handle}>
      {function Content({ payload }) {
        const [loading, setLoading] = useState(false);

        return (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm deletion</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this item? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={loading}
                className="bg-destructive"
                onClick={async () => {
                  if (!payload) return;

                  setLoading(true);
                  if (payload.type === "file") {
                    await api.deleteFile(payload.id);
                  } else if (payload.type === "folder") {
                    await api.deleteFolder(payload.id);
                  }
                  setLoading(false);
                  await mutate("file");
                  handle.close();
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        );
      }}
    </AlertDialog>
  );
}