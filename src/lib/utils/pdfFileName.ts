// src/lib/utils/pdfFileName.ts
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

function sanitizeFileNamePart(value: string): string {
  return value.replace(UNSAFE_FILENAME_CHARS, '');
}

export function pdfFileName(client: string, project: string): string {
  const trimmedClient = sanitizeFileNamePart(client.trim());
  const trimmedProject = sanitizeFileNamePart(project.trim());
  if (trimmedClient && trimmedProject) {
    return `${trimmedClient}-${trimmedProject}-Estimate.pdf`;
  }
  const date = new Date().toISOString().slice(0, 10);
  return `Estimate-${date}.pdf`;
}

export function excelFileName(client: string, project: string): string {
  const trimmedClient = sanitizeFileNamePart(client.trim());
  const trimmedProject = sanitizeFileNamePart(project.trim());
  if (trimmedClient && trimmedProject) {
    return `${trimmedClient}-${trimmedProject}-Estimate.xlsx`;
  }
  const date = new Date().toISOString().slice(0, 10);
  return `Estimate-${date}.xlsx`;
}
