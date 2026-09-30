import path from "node:path";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { AppError, validDate } from "./store.mjs";

const MAX_ROWS = 20000,
  MAX_COLUMNS = 200,
  MAX_FILE_BYTES = 8 * 1024 * 1024;
const fail = (message) => {
  throw new AppError(400, message);
};
const formula = Object.freeze({ formula: true });
const displayCell = (value) =>
  value?.formula
    ? "[Formula: replace with a value]"
    : value instanceof Date
      ? value.toISOString().slice(0, 10)
      : (value ?? "");

function checkArchive(buffer) {
  // Bound advertised expanded ZIP size before ExcelJS decompresses workbook XML.
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) fail("The XLSX file is not a valid ZIP workbook.");
  const entries = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (entries > 1000 || offset >= buffer.length)
    fail("Workbook archive is too large or unsupported.");
  let at = offset,
    total = 0;
  for (let i = 0; i < entries; i++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50)
      fail("Workbook archive is malformed.");
    const size = buffer.readUInt32LE(at + 24);
    total += size;
    if (size > 32 * 1024 * 1024 || total > 64 * 1024 * 1024)
      fail("Expanded workbook is too large. Export a smaller CSV or workbook.");
    at +=
      46 +
      buffer.readUInt16LE(at + 28) +
      buffer.readUInt16LE(at + 30) +
      buffer.readUInt16LE(at + 32);
  }
}

function makeTable(matrix) {
  while (matrix.length && matrix[0].every((v) => v == null || v === ""))
    matrix.shift();
  if (!matrix.length) fail("The file has no header row.");
  const headers = matrix.shift().map((v) => String(displayCell(v)).trim());
  while (headers.at(-1) === "") headers.pop();
  if (
    !headers.length ||
    headers.length > MAX_COLUMNS ||
    headers.some((h) => !h || h.length > 200) ||
    new Set(headers).size !== headers.length
  )
    fail("Use unique, non-empty column headers (up to 200 columns).");
  const records = matrix
    .filter((row) => row.some((v) => v != null && v !== ""))
    .map((row, i) => {
      if (
        row.length > headers.length &&
        row.slice(headers.length).some((v) => v != null && v !== "")
      )
        fail(`Row ${i + 2} has values beyond the header columns.`);
      return Object.fromEntries(
        headers.map((h, index) => [h, row[index] ?? ""]),
      );
    });
  if (records.length > MAX_ROWS)
    fail(`Import at most ${MAX_ROWS} data rows at a time.`);
  return { columns: headers, records };
}

export async function parseImport(input) {
  if (
    !input ||
    typeof input.filename !== "string" ||
    input.filename.length > 255 ||
    typeof input.content !== "string"
  )
    fail("Provide filename and base64 file content.");
  if (
    input.content.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.content)
  )
    fail("File must be valid base64 and at most 8 MB.");
  const buffer = Buffer.from(input.content, "base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES)
    fail("File is empty or larger than 8 MB.");
  const extension = path.extname(input.filename).toLowerCase();
  let matrix, sheets, sheet;
  if (extension === ".csv") {
    try {
      matrix = parse(buffer.toString("utf8"), {
        bom: true,
        skip_empty_lines: true,
        max_record_size: 128 * 1024,
        relax_column_count: true,
      });
    } catch {
      fail("CSV could not be read. Check comma delimiters and quoted fields.");
    }
    if (matrix.length > MAX_ROWS + 1)
      fail(`Import at most ${MAX_ROWS} data rows at a time.`);
    sheets = ["CSV"];
    sheet = "CSV";
  } else if (extension === ".xlsx") {
    checkArchive(buffer);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
    } catch {
      fail(
        "Workbook could not be read. Upload a valid .xlsx file, or export CSV.",
      );
    }
    sheets = workbook.worksheets.map((s) => s.name);
    if (!sheets.length) fail("Workbook has no worksheets.");
    sheet = input.sheet ?? sheets[0];
    const worksheet = workbook.getWorksheet(sheet);
    if (!worksheet) fail("Selected worksheet does not exist.");
    if (
      worksheet.rowCount > MAX_ROWS + 1 ||
      worksheet.columnCount > MAX_COLUMNS
    )
      fail(
        `Workbook sheet exceeds ${MAX_ROWS} rows or ${MAX_COLUMNS} columns.`,
      );
    matrix = [];
    for (let i = 1; i <= worksheet.rowCount; i++) {
      const cells = [];
      for (let col = 1; col <= worksheet.columnCount; col++) {
        const cell = worksheet.getRow(i).getCell(col);
        const v = cell.value;
        if (v && typeof v === "object" && !(v instanceof Date)) {
          if ("formula" in v || "sharedFormula" in v) cells.push(formula);
          else if ("richText" in v)
            cells.push(v.richText.map((t) => t.text).join(""));
          else if ("text" in v) cells.push(v.text);
          else cells.push("");
        } else if (
          typeof v === "number" &&
          /(^|[^\\])%/.test((cell.numFmt || "").replace(/"[^"]*"/g, ""))
        ) {
          // Excel stores 4.5% as 0.045. Match the displayed percentage-point unit
          // used by manual entry and show the converted value in the preview.
          cells.push(Number((v * 100).toPrecision(14)));
        } else cells.push(v);
      }
      matrix.push(cells);
    }
  } else
    fail(
      "Supported files are .csv and .xlsx. Save older .xls files as .xlsx or CSV.",
    );
  const table = makeTable(matrix);
  return { ...table, sheets, sheet };
}

export function previewResult(parsed) {
  return {
    sheets: parsed.sheets,
    sheet: parsed.sheet,
    columns: parsed.columns,
    rows: parsed.records
      .slice(0, 100)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, displayCell(v)]),
        ),
      ),
    totalRows: parsed.records.length,
  };
}

function dateValue(value, row) {
  if (value?.formula)
    fail(
      `Row ${row}: formula dates cannot be imported. Replace formulas with values.`,
    );
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "string" && validDate(value.trim())) return value.trim();
  if (
    typeof value === "number" ||
    (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()))
  ) {
    const serial = Number(value);
    if (Number.isFinite(serial) && serial >= 61 && serial <= 2958465)
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
        .toISOString()
        .slice(0, 10);
  }
  fail(
    `Row ${row}: date must be YYYY-MM-DD or an Excel date. Ambiguous dates are not imported.`,
  );
}

function numericValue(value, row) {
  if (value?.formula)
    fail(
      `Row ${row}: formulas cannot be imported. Replace formulas with values.`,
    );
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    let text = value.trim().replace(/\s*%$/, "");
    if (/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text))
      text = text.replaceAll(",", "");
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
      const n = Number(text);
      if (Number.isFinite(n)) return n;
    }
  }
  fail(
    `Row ${row}: use a number with a decimal point, optional comma thousands separators, or a percent sign. Currency and ambiguous decimal commas are not imported.`,
  );
}

export function mappedMetrics(parsed, input) {
  if (
    !input.mapping ||
    !parsed.columns.includes(input.mapping.date) ||
    !parsed.columns.includes(input.mapping.value) ||
    input.mapping.date === input.mapping.value
  )
    fail("Map different source columns for date and value.");
  const dimensions = { accountId: input.accountId, kpiId: input.kpiId };
  for (const field of ["campaignId", "strategyId", "postId"])
    if (input[field]) dimensions[field] = input[field];
  if (!parsed.records.length) fail("The selected table has no data rows.");
  return parsed.records.map((row, i) => ({
    ...dimensions,
    date: dateValue(row[input.mapping.date], i + 2),
    value: numericValue(row[input.mapping.value], i + 2),
  }));
}
