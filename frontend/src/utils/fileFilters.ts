export function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function filterPdfs(files: File[]): File[] {
  return files.filter(isPdf);
}

export function inferFolderNameFromFiles(files: File[]): string {
  const first = files[0] as File & { webkitRelativePath?: string };
  const rel = first?.webkitRelativePath;
  if (!rel) return "";
  const parts = rel.split("/");
  return parts.length > 1 ? parts[0] : "";
}
