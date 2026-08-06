export function rawFileUrl(path: string) {
  const params = new URLSearchParams({ path, type: "raw" });
  return `/api/files/_?${params}`;
}
