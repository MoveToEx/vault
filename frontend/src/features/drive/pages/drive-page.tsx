import NewFolderDialog from "@/features/drive/dialogs/new-folder-dialog";
import UploadDialog from "@/features/drive/dialogs/upload-dialog";
import { useAppDispatch, useAppSelector } from "@/shared/stores";
import { Fragment } from "react";
import RequireKeys from "@/features/auth/components/require-umk";
import { popUntil, reset } from "@/shared/stores/path";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/shared/components/ui/breadcrumb";
import FileList from "../components/file-list";

function Breadcrumbs() {
  const path = useAppSelector((state) => state.path.value);
  const dispatch = useAppDispatch();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink
            className="w-8 text-center select-none cursor-pointer"
            onClick={() => dispatch(reset())}
          >
            /
          </BreadcrumbLink>
        </BreadcrumbItem>

        {path.map((it) => (
          <Fragment key={it.id}>
            <BreadcrumbSeparator />

            <BreadcrumbItem>
              <BreadcrumbLink
                className="select-none cursor-pointer"
                onClick={() => dispatch(popUntil(it.id))}
              >
                {it.folderName}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default function DrivePage() {
  return (
    <div className="flex flex-col h-full">
      <RequireKeys />

      <div className="flex flex-row justify-start items-center gap-4 mb-4">
        <UploadDialog />
        <NewFolderDialog />
      </div>

      <Breadcrumbs />

      <FileList />
    </div>
  );
}
