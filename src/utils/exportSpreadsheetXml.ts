export type SpreadsheetColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function exportSpreadsheetXml<T>(
  rows: T[],
  columns: SpreadsheetColumn<T>[],
  fileName: string,
  sheetName = "Dati",
): void {
  const headerCells = columns
    .map(
      (col) =>
        `<Cell><Data ss:Type="String">${xmlEscape(col.header)}</Data></Cell>`,
    )
    .join("");

  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((col) => {
          const raw = col.value(row);
          if (raw == null) return '<Cell><Data ss:Type="String"></Data></Cell>';
          if (typeof raw === "number" && Number.isFinite(raw)) {
            return `<Cell><Data ss:Type="Number">${raw}</Data></Cell>`;
          }
          return `<Cell><Data ss:Type="String">${xmlEscape(String(raw))}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  const xml = [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:html="http://www.w3.org/TR/REC-html40">',
    `<Worksheet ss:Name="${xmlEscape(sheetName)}">`,
    "<Table>",
    `<Row>${headerCells}</Row>`,
    bodyRows,
    "</Table>",
    "</Worksheet>",
    "</Workbook>",
  ].join("");

  const blob = new Blob([xml], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
