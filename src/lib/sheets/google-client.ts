import "server-only";

import { JWT } from "google-auth-library";

export class GoogleSheetsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSheetsConfigError";
  }
}

interface GoogleSheetsConfig {
  spreadsheetId: string;
  serviceAccountEmail: string;
  privateKey: string;
}

const sheetsScope = "https://www.googleapis.com/auth/spreadsheets";
const sheetsApiBase = "https://sheets.googleapis.com/v4/spreadsheets";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new GoogleSheetsConfigError(`${name} is not configured.`);
  }

  return value;
}

function loadConfig(): GoogleSheetsConfig {
  return {
    spreadsheetId: requiredEnv("GOOGLE_SHEETS_SPREADSHEET_ID"),
    serviceAccountEmail: requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: requiredEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n")
  };
}

export interface GoogleSheetsValuesClient {
  batchGet(ranges: string[]): Promise<Record<string, string[][]>>;
  batchUpdate(data: Array<{ range: string; values: string[][] }>): Promise<void>;
  append(range: string, values: string[][]): Promise<void>;
}

export async function createGoogleSheetsValuesClient(): Promise<GoogleSheetsValuesClient> {
  const config = loadConfig();
  const authClient = new JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: sheetsScope
  });

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await authClient.fetch(`${sheetsApiBase}/${config.spreadsheetId}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init.headers
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Google Sheets API request failed with ${response.status}.`);
    }

    return response.data as T;
  }

  return {
    async batchGet(ranges) {
      const params = new URLSearchParams();
      ranges.forEach((range) => params.append("ranges", range));
      params.set("majorDimension", "ROWS");

      const data = await request<{ valueRanges?: Array<{ range: string; values?: string[][] }> }>(
        `/values:batchGet?${params.toString()}`
      );

      return Object.fromEntries(
        ranges.map((range, index) => [range.split("!")[0], data.valueRanges?.[index]?.values ?? []])
      );
    },
    async batchUpdate(data) {
      if (data.length === 0) {
        return;
      }

      await request("/values:batchUpdate", {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data
        })
      });
    },
    async append(range, values) {
      if (values.length === 0) {
        return;
      }

      await request(`/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
        method: "POST",
        body: JSON.stringify({ values })
      });
    }
  };
}
