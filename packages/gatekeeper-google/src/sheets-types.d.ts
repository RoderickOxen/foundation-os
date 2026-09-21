/** A value returned from a Google Sheets cell. */
export type SpreadsheetCellValue = string | number | boolean | null;

/** Metadata about one worksheet in the connected spreadsheet. */
export type SpreadsheetSheetInfo = {
  /** Stable numeric worksheet ID. */
  id: number;
  /** Worksheet title shown on its tab. */
  title: string;
  /** Zero-based worksheet position. */
  index: number;
  /** Number of rows currently allocated to the worksheet. */
  rowCount: number;
  /** Number of columns currently allocated to the worksheet. */
  columnCount: number;
  /** Whether the worksheet is hidden. */
  hidden?: boolean;
};

/** Metadata about the connected spreadsheet. */
export type SpreadsheetInfo = {
  /** Stable Google spreadsheet ID. */
  id: string;
  /** Spreadsheet title. */
  title: string;
  /** Spreadsheet locale, such as `en_US`. */
  locale?: string;
  /** Spreadsheet time zone, such as `America/Los_Angeles`. */
  timeZone?: string;
  /** Worksheets in display order. */
  sheets: SpreadsheetSheetInfo[];
};

/** How values read from cells should be represented. */
export type SpreadsheetValueMode =
  /** Values formatted as they appear in Google Sheets. This is the default. */
  | "formatted"
  /** Underlying numbers, strings, and booleans. Dates and times are serial numbers. */
  | "raw"
  /** Formula text for formula cells and ordinary values for other cells. */
  | "formula";

/** Values read from one rectangular range. */
export type SpreadsheetRange = {
  /** Canonical A1 range returned by Google Sheets. */
  range: string;
  /** Rectangular rows of values. Blank cells are `null`. */
  values: SpreadsheetCellValue[][];
};

/**
 * Read and write access to one selected Google spreadsheet.
 *
 * READS (no approval required):
 *   getSpreadsheet(), readRange(), readRanges() — return data as observations.
 *
 * WRITES (require user approval before executing):
 *   appendRows() — append new rows after the last row of data in a range.
 *   updateRange() — overwrite a bounded rectangular range with new values.
 *
 * All writes use valueInputOption=RAW: values are stored as-is and are never
 * interpreted as formulas, regardless of leading characters. There is no
 * auto-formula injection risk.
 *
 * The bound spreadsheetId cannot be changed; all writes are confined to the
 * connected spreadsheet. Writes go through the approval queue — they are
 * never auto-approved and never executed before the user confirms.
 *
 * NOT AVAILABLE on this session:
 *   ✗ Creating or deleting sheets/tabs
 *   ✗ Formatting, merging cells, or changing column widths
 *   ✗ Batch updates (batchUpdate API)
 *   ✗ Reading/writing other spreadsheets (spreadsheetId is fixed at binding time)
 */
export interface GoogleSpreadsheetSession {
  /** Return spreadsheet metadata and its worksheet list. */
  getSpreadsheet(): Promise<SpreadsheetInfo>;

  /**
   * Read a bounded A1 range, such as `'Sales 2026'!A1:F200`.
   * Whole-row, whole-column, named, and unbounded ranges are not accepted. The read throws if the
   * response exceeds 5 MiB; request a smaller range when cells contain large values.
   */
  readRange(
    range: string,
    options?: { valueMode?: SpreadsheetValueMode },
  ): Promise<SpreadsheetRange>;

  /**
   * Read several bounded A1 ranges in one request. At most 20 ranges and 50,000 total cells may
   * be requested at once. The combined response must not exceed 5 MiB.
   */
  readRanges(
    ranges: string[],
    options?: { valueMode?: SpreadsheetValueMode },
  ): Promise<SpreadsheetRange[]>;

  /**
   * Submit a request to append rows after the last row of data in `range`.
   * Values are stored as RAW literals — no formula parsing, no injection risk.
   * The range must be a bounded A1 range, e.g. `'Alunos'!A1:F1000`.
   * At most 1,000 rows and 50,000 cells may be written per call.
   * Requires user approval before the data is written.
   *
   * Example: append a new student record
   *   await session.appendRows("Alunos!A1:F1", [["Ana", "2025-09-01", "Turma A"]]);
   */
  appendRows(
    range: string,
    values: SpreadsheetCellValue[][],
  ): Promise<void>;

  /**
   * Submit a request to overwrite a bounded rectangular range with `values`.
   * Values are stored as RAW literals — no formula parsing, no injection risk.
   * The range must be a bounded A1 range; the values array must fit within it.
   * At most 1,000 rows and 50,000 cells may be written per call.
   * Requires user approval before the data is written.
   *
   * Example: update a student record in row 5
   *   await session.updateRange("Alunos!A5:C5", [["Ana", "2025-09-01", "Turma B"]]);
   */
  updateRange(
    range: string,
    values: SpreadsheetCellValue[][],
  ): Promise<void>;
}
