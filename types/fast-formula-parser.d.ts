declare module "fast-formula-parser" {
  export type FormulaCellReference = { col: number; row: number; sheet?: string };
  export type FormulaRangeReference = { from: FormulaCellReference; to: FormulaCellReference; sheet?: string };
  export type FormulaValue = boolean | number | string | FormulaValue[][];

  export type FormulaParserOptions = {
    onCell?: (reference: FormulaCellReference) => FormulaValue;
    onRange?: (reference: FormulaRangeReference) => FormulaValue[][];
  };

  export default class FormulaParser {
    constructor(options?: FormulaParserOptions);
    parse(formula: string, position: FormulaCellReference, allowArray?: boolean): FormulaValue;
  }
}