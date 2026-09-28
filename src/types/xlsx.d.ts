/** Fallback de tipagens para SheetJS (xlsx) quando o resolver do CRA/IDE falha. */
declare module 'xlsx' {
  export interface WorkBook {
    SheetNames: string[];
    Sheets: Record<string, WorkSheet>;
  }

  export interface WorkSheet {
    [cell: string]: unknown;
  }

  export const utils: {
    aoa_to_sheet: (data: unknown[][]) => WorkSheet;
    book_new: () => WorkBook;
    book_append_sheet: (wb: WorkBook, ws: WorkSheet, name: string) => void;
    sheet_to_json: <T = Record<string, unknown>>(ws: WorkSheet, opts?: object) => T[];
  };

  export const SSF: {
    parse_date_code: (v: number) => { y: number; m: number; d: number } | null;
  };

  export function read(data: ArrayBuffer | string, opts?: object): WorkBook;
  export function writeFile(wb: WorkBook, filename: string, opts?: object): void;
}
