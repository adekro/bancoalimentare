export type SpreadsheetColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

type XmlCell = {
  index?: number;
  value?: string | number | null;
  styleId?: string;
  mergeAcross?: number;
  mergeDown?: number;
  type?: "String" | "Number";
};

type XmlRow = {
  height?: number;
  cells: XmlCell[];
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

function buildCellXml(cell: XmlCell): string {
  const attrs: string[] = [];
  if (typeof cell.index === "number" && cell.index > 0) {
    attrs.push(` ss:Index="${cell.index}"`);
  }
  if (cell.styleId) attrs.push(` ss:StyleID="${xmlEscape(cell.styleId)}"`);
  if (typeof cell.mergeAcross === "number" && cell.mergeAcross > 0) {
    attrs.push(` ss:MergeAcross="${cell.mergeAcross}"`);
  }
  if (typeof cell.mergeDown === "number" && cell.mergeDown > 0) {
    attrs.push(` ss:MergeDown="${cell.mergeDown}"`);
  }

  const raw = cell.value;
  const type =
    cell.type ??
    (typeof raw === "number" && Number.isFinite(raw) ? "Number" : "String");
  const value = raw == null ? "" : String(raw);

  return `<Cell${attrs.join("")}><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`;
}

function buildRowXml(row: XmlRow): string {
  const attrs = row.height ? ` ss:AutoFitHeight="0" ss:Height="${row.height}"` : "";
  return `<Row${attrs}>${row.cells.map(buildCellXml).join("")}</Row>`;
}

function downloadXmlDocument(fileName: string, xml: string): void {
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

export type RiepilogoDocConfig = {
  fileName: string;
  sheetName?: string;
  titolo: string;
  zonaLabel: string;
  dateLabels: string[];
  previousLegend: string;
  detailHeaders?: string[];
  previousValues: Array<{ label: string; value: number | null }>;
  righe: Array<{
    leftValues: Array<string | number | null>;
    previousValues: Array<number | null>;
    dateValues: Array<number | null>;
  }>;
};

export function exportRiepilogoDistribuzioniDocXml(
  config: RiepilogoDocConfig,
): void {
  const totalDateColumns = Math.max(config.dateLabels.length, 1);
  const leftColumnCount = Math.max(config.detailHeaders?.length ?? 1, 1);
  const leftHeaders = config.detailHeaders ?? ["GRUPPO"];
  const css = `
    body { font-family: Arial, sans-serif; }
    table { border-collapse: collapse; }
    td, th {
      border: 1px solid #000;
      font-size: 10px;
      padding: 4px 6px;
      text-align: center;
      vertical-align: middle;
      white-space: nowrap;
    }
    .title { font-size: 18px; font-weight: 700; text-align: left; border: 0; padding: 2px 0 8px; }
    .subtitle { font-size: 11px; text-align: left; border: 0; padding: 0 0 8px; }
    .left { text-align: left; }
    .section { font-weight: 700; background: #f2f2f2; }
    .empty { min-width: 52px; height: 22px; }
    .w-wide { min-width: 210px; }
    .w-mid { min-width: 100px; }
    .w-small { min-width: 55px; }
  `;

  const htmlEscape = (value: string | number | null | undefined) =>
    value == null ? "" : String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const titleColspan = leftColumnCount + config.previousValues.length + totalDateColumns;

  const headerRow1 = `
    <tr>
      <th class="section left" colspan="${leftColumnCount}" rowspan="3">${htmlEscape(leftHeaders[0])}</th>
      <th class="section" colspan="${config.previousValues.length}">${htmlEscape(config.previousLegend)}</th>
      <th class="section" colspan="${totalDateColumns}">DATE DA COMPILARE A MANO</th>
    </tr>
  `;

  const leftHeaderCells = leftHeaders.slice(1).map((header) =>
    `<th class="section">${htmlEscape(header)}</th>`,
  ).join("");
  const previousHeaderCells = config.previousValues.map((item) =>
    `<th class="section">${htmlEscape(item.label)}</th>`,
  ).join("");
  const dateHeaderCells = config.dateLabels.map((label) =>
    `<th class="section">${htmlEscape(label)}</th>`,
  ).join("");

  const previousTotalsCells = config.previousValues.map((item) =>
    `<td>${htmlEscape(item.value ?? "")}</td>`,
  ).join("");
  const emptyLeftCells = leftHeaders.slice(1).map(() => "<td></td>").join("");
  const emptyDateCells = Array.from({ length: totalDateColumns }, () => '<td class="empty"></td>').join("");

  const bodyRows = config.righe.map((riga) => {
    const leftCells = riga.leftValues.map((value, index) => {
      const cls = index === 0 ? "left" : "";
      return `<td class="${cls}">${htmlEscape(value ?? "")}</td>`;
    }).join("");
    const previousCells = riga.previousValues.map((value) =>
      `<td>${htmlEscape(value ?? "")}</td>`,
    ).join("");
    const dateCells = riga.dateValues.map((value) =>
      `<td class="empty">${htmlEscape(value ?? "")}</td>`,
    ).join("");
    return `<tr>${leftCells}${previousCells}${dateCells}</tr>`;
  }).join("");

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>${css}</style>
      </head>
      <body>
        <table>
          <tr><td class="title" colspan="${titleColspan}">${htmlEscape(config.titolo)}</td></tr>
          <tr><td class="subtitle" colspan="${titleColspan}">${htmlEscape(config.zonaLabel)}</td></tr>
          ${headerRow1}
          <tr>${leftHeaderCells}${previousHeaderCells}${dateHeaderCells}</tr>
          <tr>${emptyLeftCells}${previousTotalsCells}${emptyDateCells}</tr>
          ${bodyRows}
        </table>
      </body>
    </html>
  `.trim();

  downloadXmlDocument(config.fileName, html);
}
