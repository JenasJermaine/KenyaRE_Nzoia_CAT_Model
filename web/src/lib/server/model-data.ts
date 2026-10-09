import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readModelJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(process.cwd(), "public", "data", `${name}.json`), "utf8")) as T;
}