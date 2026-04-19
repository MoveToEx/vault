import { useState, useRef } from "react";
import _ from "lodash";
import { Upload } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export default function DragDrop({
  className = "",
  multiple = false,
  onChange,
  ...rest
}: {
  className?: string,
  multiple?: boolean,
  onChange: (files: File[]) => void
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      {...rest}
      className={
        cn(
          "flex flex-col items-center justify-center rounded border-2 border-dashed border-gray-400 dark:border-gray-700 w-full min-h-48",
          dragging
            ? "**:pointer-events-none bg-gray-200 dark:bg-gray-800 border-blue-400 dark:border-blue-900"
            : "",
          className,
        )
      }
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragging) setDragging(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragging) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);

        const items = [...e.dataTransfer.items].filter((item) => {
          return item.kind === "file";
        });

        const result = _.compact(items.map(item => item.getAsFile()));

        if (result.length > 0) {
          onChange(result);
        }
      }}
    >
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        onChange={(e) => {
          if (e.target.files) onChange([...e.target.files]);
        }}
        multiple={multiple}
      />
      <Upload size={48} />
      <span className="text-md text-center">
        {t("dragDrop.dropPrompt")}
        <Button
          type="button"
          variant="link"
          className="p-0 text-secondary-foreground"
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.click();
            }
          }}
        >
          {t("dragDrop.browse")}
        </Button>
      </span>
    </div>
  );
}