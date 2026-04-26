import {
  FileArchive,
  FileCode,
  FileCog,
  FileIcon,
  FileImage,
  FileMusic,
  FilePen,
  FilePlay,
  type LucideProps
} from "lucide-react";

function endsWith(str: string, suffix: string[]) {
  return suffix.some((it) => str.endsWith(it));
}


export default function ExtIcon({ filename, ...props }: { filename: string } & LucideProps) {
  if (!filename) return <FileIcon {...props} />;
  filename = filename.toLowerCase();

  if (endsWith(filename, [".rar", ".zip", ".zipx", ".7z", ".tar", ".gz", ".gz.zip", ".tar.bz"])) {
    return <FileArchive {...props} />;
  } else if (endsWith(filename, [ ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".jiff", ".apng", ".webp"])) {
    return <FileImage {...props} />;
  } else if (
    endsWith(filename, [
      ".c", ".cpp", ".cxx", ".ts", ".tsx", ".js", ".jsx",
      ".java", ".kt", ".lock", ".html", ".rs", ".go", ".py",
    ])
  ) {
    return <FileCode {...props} />;
  } else if (endsWith(filename, [ ".pdf", ".doc", ".docx", ".dot", ".ppt", ".pptx", ".xls", ".csv", ".md", ".txt" ])) {
    return <FilePen {...props} />;
  } else if (endsWith(filename, [".mp3", ".flac", ".aac", ".ogg"])) {
    return <FileMusic {...props} />;
  } else if (endsWith(filename, [".mp4", ".mkv", ".webm"])) {
    return <FilePlay {...props} />;
  } else if (endsWith(filename, [".json", ".yml", ".yaml", ".ini", ".toml"])) {
    return <FileCog {...props} />;
  }
  return <FileIcon {...props} />;
}