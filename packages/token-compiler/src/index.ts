export interface DesignTokensInput {
  colors?: Record<string, string>;
  spacing?: Record<string, string | number>;
  radius?: Record<string, string | number>;
  shadows?: Record<string, string>;
  typography?: Record<string, string | number>;
}

export interface CompiledTokens {
  cssVariables: string;
  tsModule: string;
  flat: Record<string, string>;
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function normalizeValue(value: string | number): string {
  return typeof value === "number" ? String(value) : value.trim();
}

export function compileTokens(input: DesignTokensInput): CompiledTokens {
  const groups: Array<[string, Record<string, string | number> | undefined]> = [
    ["color", input.colors],
    ["space", input.spacing],
    ["radius", input.radius],
    ["shadow", input.shadows],
    ["type", input.typography],
  ];

  const flat: Record<string, string> = {};

  for (const [prefix, record] of groups) {
    if (!record) continue;
    for (const [key, rawValue] of Object.entries(record)) {
      const tokenKey = `--jenan-${prefix}-${toKebabCase(key)}`;
      flat[tokenKey] = normalizeValue(rawValue);
    }
  }

  const cssLines = Object.entries(flat).map(([key, value]) => `  ${key}: ${value};`);
  const cssVariables = [":root {", ...cssLines, "}"].join("\n");

  const tsEntries = Object.entries(flat)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(",\n");
  const tsModule = `export const jenanTokens = {\n${tsEntries}\n} as const;\n`;

  return { cssVariables, tsModule, flat };
}

const tokenCompiler = { compileTokens };
export default tokenCompiler;
