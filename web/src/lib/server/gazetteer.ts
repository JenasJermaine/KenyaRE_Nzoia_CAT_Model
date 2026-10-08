import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GazetteerPlace } from "../types";

let cache: string[] | null = null;

export async function placeNames(): Promise<string[]> {
  if (cache) return cache;
  const raw = await readFile(join(process.cwd(), "public", "data", "gazetteer.json"), "utf8");
  cache = (JSON.parse(raw) as GazetteerPlace[]).map((g) => g.name);
  return cache;
}
