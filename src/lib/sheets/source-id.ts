import "server-only";

import { GoogleSheetsConfigError } from "./google-client";
import { createSheetSourceId } from "./source-id-core";

export { createSheetSourceId } from "./source-id-core";

export function getConfiguredSheetSourceId(): string {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) {
    throw new GoogleSheetsConfigError("GOOGLE_SHEETS_SPREADSHEET_ID is not configured.");
  }

  return createSheetSourceId(spreadsheetId);
}
