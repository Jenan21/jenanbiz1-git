import FormulaParser, { type FormulaCellReference, type FormulaRangeReference, type FormulaValue } from "fast-formula-parser";

function sourceValue(value: string): FormulaValue {
  if (!value.trim()) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

export function evaluateSheetRows(rows: string[][]): string[][] {
  const cache = new Map<string, FormulaValue>();
  const evaluating = new Set<string>();

  function cellValue(reference: FormulaCellReference): FormulaValue {
    const key = `${reference.row}:${reference.col}`;
    if (cache.has(key)) return cache.get(key)!;
    const source = rows[reference.row - 1]?.[reference.col - 1] ?? "";
    if (!source.startsWith("=")) return sourceValue(source);
    if (evaluating.has(key)) return "#CYCLE!";
    evaluating.add(key);
    try {
      const value = parser.parse(source.slice(1), { col: reference.col, row: reference.row, sheet: reference.sheet ?? "Sheet1" });
      cache.set(key, value);
      return value;
    } catch (error) {
      const value = error instanceof Error && error.name.startsWith("#") ? error.name : "#ERROR!";
      cache.set(key, value);
      return value;
    } finally {
      evaluating.delete(key);
    }
  }

  function rangeValues(reference: FormulaRangeReference): FormulaValue[][] {
    const values: FormulaValue[][] = [];
    for (let row = reference.from.row; row <= reference.to.row; row += 1) {
      const current: FormulaValue[] = [];
      for (let col = reference.from.col; col <= reference.to.col; col += 1) current.push(cellValue({ col, row, sheet: reference.sheet }));
      values.push(current);
    }
    return values;
  }

  const parser = new FormulaParser({ onCell: cellValue, onRange: rangeValues });
  return rows.map((row, rowIndex) => row.map((cell, columnIndex) => cell.startsWith("=") ? String(cellValue({ col: columnIndex + 1, row: rowIndex + 1, sheet: "Sheet1" })) : cell));
}