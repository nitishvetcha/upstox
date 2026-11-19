// Reads saved research inventories (newest first). Server-side only.
import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "../dataRoot.ts";
import type { Experiment, Inventory } from "./optionsInventory.ts";

export type SavedInventory = Inventory & { experiments: Experiment[] };

export function loadInventories(dir = path.join(dataRoot(), "options-research")): SavedInventory[] {
  try {
    // turbopackIgnore: the inventory directory is a runtime data path (APP_DATA_DIR or .data), not bundled.
    return fs.readdirSync(/* turbopackIgnore: true */ dir).filter((f) => f.startsWith("inventory_") && f.endsWith(".json")).sort().reverse()
      .map((f) => JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ dir, f), "utf8")) as SavedInventory);
  } catch { return []; }
}
