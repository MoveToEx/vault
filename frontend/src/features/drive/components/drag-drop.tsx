import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

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

        const result = items.map(item => item.getAsFile()).filter(it => !!it);

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
        Drop files here or 
        <Button
          type="button"
          variant="link"
          className="ml-1 p-0 underline hover:cursor-pointer text-secondary-foreground"
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.click();
            }
          }}
        >
          browse
        </Button>
      </span>
    </div>
  );
}