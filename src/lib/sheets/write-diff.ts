export interface SheetCellUpdate {
  range: string;
  values: string[][];
}

export function columnLetter(index: number): string {
  let dividend = index;
  let column = "";

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    column = String.fromCharCode(65 + modulo) + column;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return column;
}

export function changedCellUpdates(
  sheetName: string,
  rowNumber: number,
  previousValues: string[],
  nextValues: string[]
): SheetCellUpdate[] {
  const updates: SheetCellUpdate[] = [];
  let columnIndex = 0;

  while (columnIndex < nextValues.length) {
    if (nextValues[columnIndex] === previousValues[columnIndex]) {
      columnIndex += 1;
      continue;
    }

    const startIndex = columnIndex;
    while (
      columnIndex + 1 < nextValues.length &&
      nextValues[columnIndex + 1] !== previousValues[columnIndex + 1]
    ) {
      columnIndex += 1;
    }

    const startColumn = columnLetter(startIndex + 1);
    const endColumn = columnLetter(columnIndex + 1);
    updates.push({
      range: `${sheetName}!${startColumn}${rowNumber}:${endColumn}${rowNumber}`,
      values: [nextValues.slice(startIndex, columnIndex + 1)]
    });
    columnIndex += 1;
  }

  return updates;
}
