import "server-only";

import type { Change, Conflict, Owner, Point, Visit } from "@/lib/data-model/types";
import {
  parseChangeRow,
  parseConflictRow,
  parseOwnerRow,
  parsePointRow,
  parseVisitRow,
  serializeChangeRow,
  serializeConflictRow,
  serializeOwnerRow,
  serializePointRow,
  serializeVisitRow,
  SHEET_COLUMNS,
  SHEET_NAMES,
  type SheetName,
  type SheetRowDiagnostic
} from "./schema";
import { createGoogleSheetsValuesClient, type GoogleSheetsValuesClient } from "./google-client";

type SheetKey = keyof typeof SHEET_COLUMNS;
type RowObject = Record<string, string>;

interface ParsedSheet<T> {
  records: T[];
  rowNumbersById: Map<string, number>;
  diagnostics: SheetRowDiagnostic[];
}

export interface SheetsSnapshot {
  points: Point[];
  owners: Owner[];
  visits: Visit[];
  changesLog: Change[];
  conflicts: Conflict[];
  diagnostics: SheetRowDiagnostic[];
  rowNumbers: {
    points: Map<string, number>;
    owners: Map<string, number>;
    visits: Map<string, number>;
    conflicts: Map<string, number>;
  };
}

export interface SheetsWriteSet {
  points?: Point[];
  owners?: Owner[];
  visits?: Visit[];
  changesLog?: Change[];
  conflicts?: Conflict[];
}

const sheetNameByKey = {
  points: SHEET_NAMES.points,
  owners: SHEET_NAMES.owners,
  visits: SHEET_NAMES.visits,
  changesLog: SHEET_NAMES.changesLog,
  conflicts: SHEET_NAMES.conflicts
} as const satisfies Record<SheetKey, SheetName>;

const parseByKey = {
  points: parsePointRow,
  owners: parseOwnerRow,
  visits: parseVisitRow,
  changesLog: parseChangeRow,
  conflicts: parseConflictRow
};

const serializeByKey = {
  points: serializePointRow,
  owners: serializeOwnerRow,
  visits: serializeVisitRow,
  changesLog: serializeChangeRow,
  conflicts: serializeConflictRow
};

function columnLetter(index: number): string {
  let dividend = index;
  let column = "";

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    column = String.fromCharCode(65 + modulo) + column;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return column;
}

function rowToObject(headers: string[], row: string[], columns: readonly string[]): RowObject {
  return Object.fromEntries(
    columns.map((column) => {
      const index = headers.indexOf(column);
      return [column, index === -1 ? "" : row[index] ?? ""];
    })
  );
}

function rowObjectToValues(row: RowObject, columns: readonly string[]): string[] {
  return columns.map((column) => row[column] ?? "");
}

function parseSheet<TKey extends SheetKey>(
  key: TKey,
  values: string[][]
): ParsedSheet<ReturnType<(typeof parseByKey)[TKey]> extends { ok: true; data: infer T } ? T : never> {
  const sheetName = sheetNameByKey[key];
  const columns = SHEET_COLUMNS[key];
  const [headers = [], ...rows] = values;
  const diagnostics: SheetRowDiagnostic[] = [];
  const records: Array<{ id: string }> = [];
  const rowNumbersById = new Map<string, number>();

  const missingHeaders = columns.filter((column) => !headers.includes(column));
  if (missingHeaders.length > 0) {
    diagnostics.push({
      sheetName,
      rowIndex: 1,
      issues: [`Missing required columns: ${missingHeaders.join(", ")}`]
    });
  }

  rows.forEach((row, index) => {
    const rowIndex = index + 2;
    const parsed = parseByKey[key](rowToObject(headers, row, columns), rowIndex);
    if (!parsed.ok) {
      diagnostics.push(parsed.diagnostic);
      return;
    }

    records.push(parsed.data);
    rowNumbersById.set(parsed.data.id, rowIndex);
  });

  return {
    records,
    rowNumbersById,
    diagnostics
  } as ParsedSheet<ReturnType<(typeof parseByKey)[TKey]> extends { ok: true; data: infer T } ? T : never>;
}

function serializeValues<TKey extends SheetKey>(
  key: TKey,
  record: Parameters<(typeof serializeByKey)[TKey]>[0]
): string[] {
  const row = serializeByKey[key](record as never);
  return rowObjectToValues(row, SHEET_COLUMNS[key]);
}

async function upsertRecords<TKey extends "points" | "owners" | "visits" | "conflicts">(
  client: GoogleSheetsValuesClient,
  key: TKey,
  records: SheetsWriteSet[TKey],
  rowNumbersById: Map<string, number>
): Promise<void> {
  if (!records || records.length === 0) {
    return;
  }

  const columns = SHEET_COLUMNS[key];
  const sheetName = sheetNameByKey[key];
  const lastColumn = columnLetter(columns.length);
  const updates: Array<{ range: string; values: string[][] }> = [];
  const appends: string[][] = [];

  for (const record of records) {
    const values = serializeValues(key, record as never);
    const rowNumber = rowNumbersById.get(record.id);

    if (rowNumber) {
      updates.push({
        range: `${sheetName}!A${rowNumber}:${lastColumn}${rowNumber}`,
        values: [values]
      });
    } else {
      appends.push(values);
    }
  }

  await client.batchUpdate(updates);
  await client.append(`${sheetName}!A:${lastColumn}`, appends);
}

async function appendRecords<TKey extends "changesLog">(
  client: GoogleSheetsValuesClient,
  key: TKey,
  records: SheetsWriteSet[TKey]
): Promise<void> {
  if (!records || records.length === 0) {
    return;
  }

  const columns = SHEET_COLUMNS[key];
  const sheetName = sheetNameByKey[key];
  const lastColumn = columnLetter(columns.length);
  const values = records.map((record) => serializeValues(key, record));

  await client.append(`${sheetName}!A:${lastColumn}`, values);
}

export async function readSheetsSnapshot(
  client?: GoogleSheetsValuesClient
): Promise<SheetsSnapshot> {
  const sheetsClient = client ?? (await createGoogleSheetsValuesClient());
  const ranges = [
    `${SHEET_NAMES.points}!A:Z`,
    `${SHEET_NAMES.owners}!A:Z`,
    `${SHEET_NAMES.visits}!A:Z`,
    `${SHEET_NAMES.changesLog}!A:Z`,
    `${SHEET_NAMES.conflicts}!A:Z`
  ];
  const data = await sheetsClient.batchGet(ranges);
  const points = parseSheet("points", data[SHEET_NAMES.points] ?? []);
  const owners = parseSheet("owners", data[SHEET_NAMES.owners] ?? []);
  const visits = parseSheet("visits", data[SHEET_NAMES.visits] ?? []);
  const changesLog = parseSheet("changesLog", data[SHEET_NAMES.changesLog] ?? []);
  const conflicts = parseSheet("conflicts", data[SHEET_NAMES.conflicts] ?? []);

  return {
    points: points.records,
    owners: owners.records,
    visits: visits.records,
    changesLog: changesLog.records,
    conflicts: conflicts.records,
    diagnostics: [
      ...points.diagnostics,
      ...owners.diagnostics,
      ...visits.diagnostics,
      ...changesLog.diagnostics,
      ...conflicts.diagnostics
    ],
    rowNumbers: {
      points: points.rowNumbersById,
      owners: owners.rowNumbersById,
      visits: visits.rowNumbersById,
      conflicts: conflicts.rowNumbersById
    }
  };
}

export async function writeSheetsChanges(
  snapshot: SheetsSnapshot,
  writeSet: SheetsWriteSet,
  client?: GoogleSheetsValuesClient
): Promise<void> {
  const sheetsClient = client ?? (await createGoogleSheetsValuesClient());

  await upsertRecords(sheetsClient, "points", writeSet.points, snapshot.rowNumbers.points);
  await upsertRecords(sheetsClient, "owners", writeSet.owners, snapshot.rowNumbers.owners);
  await upsertRecords(sheetsClient, "visits", writeSet.visits, snapshot.rowNumbers.visits);
  await upsertRecords(sheetsClient, "conflicts", writeSet.conflicts, snapshot.rowNumbers.conflicts);
  await appendRecords(sheetsClient, "changesLog", writeSet.changesLog);
}
