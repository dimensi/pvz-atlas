import { createHash } from "node:crypto";

const sourceIdVersion = "sheets-v1";

export function createSheetSourceId(spreadsheetId: string): string {
  const normalizedId = spreadsheetId.trim();
  if (!normalizedId) {
    throw new Error("A spreadsheet ID is required to create a source ID.");
  }

  const fingerprint = createHash("sha256").update(normalizedId).digest("hex");
  return `${sourceIdVersion}_${fingerprint}`;
}
