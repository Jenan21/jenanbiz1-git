/** A small RFC 4180 reader for the tests: quoted cells may hold commas, doubled quotes and line breaks, and a leading byte order mark is ignored. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (input[index + 1] === '"') { cell += '"'; index++; }
      else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\r" && input[index + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; index++; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** The data rows keyed by their header cells. */
export function csvRecords(text: string): Array<Record<string, string>> {
  const [header = [], ...rows] = parseCsv(text);
  return rows.map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])));
}
