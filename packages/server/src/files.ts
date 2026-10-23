import { renameSync, writeFileSync } from "node:fs";

/** Write a file so a crash mid-write never leaves half a save: write a temporary copy, then swap it in. */
export function writeFileAtomic(file: string, data: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}
