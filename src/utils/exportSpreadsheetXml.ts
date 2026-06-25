export type SpreadsheetColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

type XmlCell = {
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
    type: "application/msword;charset=utf-8;",
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
  previousValues: Array<{ label: string; value: number | null }>;
  righe: Array<{
    label: string;
    previousValues: Array<number | null>;
    showDateCells?: boolean;
  }>;
};

export function exportRiepilogoDistribuzioniDocXml(
  config: RiepilogoDocConfig,
): void {
  const sheetName = config.sheetName ?? "Riepilogo";
  const totalDateColumns = Math.max(config.dateLabels.length, 1);
  const totalColumns = 1 + config.previousValues.length + totalDateColumns;

  const columnsXml = [
    '<Column ss:Index="1" ss:Width="210"/>',
    ...config.previousValues.map(
      (_, index) => `<Column ss:Index="${index + 2}" ss:Width="38"/>`,
    ),
    ...Array.from({ length: totalDateColumns }, (_, index) => {
      const xmlIndex = 2 + config.previousValues.length + index;
      return `<Column ss:Index="${xmlIndex}" ss:Width="52"/>`;
    }),
  ].join("");

  const rows: XmlRow[] = [
    {
      height: 24,
      cells: [
        {
          value: config.titolo,
          styleId: "title",
          mergeAcross: totalColumns - 1,
        },
      ],
    },
    {
      height: 20,
      cells: [
        {
          value: config.zonaLabel,
          styleId: "subtitle",
          mergeAcross: totalColumns - 1,
        },
      ],
    },
    {
      height: 18,
      cells: [
        { value: "GRUPPO", styleId: "headerLeft", mergeDown: 2 },
        {
          value: config.previousLegend,
          styleId: "headerCenter",
          mergeAcross: Math.max(config.previousValues.length - 1, 0),
        },
        {
          value: "DATE DA COMPILARE A MANO",
          styleId: "headerCenter",
          mergeAcross: totalDateColumns - 1,
        },
      ],
    },
    {
      height: 18,
      cells: [
        ...config.previousValues.map((item) => ({
          value: item.label,
          styleId: "headerSmall",
        })),
        ...config.dateLabels.map((label) => ({
          value: label,
          styleId: "headerSmall",
        })),
        ...Array.from({
          length: Math.max(0, totalDateColumns - config.dateLabels.length),
        }).map(() => ({
          value: "",
          styleId: "headerSmall",
        })),
      ],
    },
    {
      height: 18,
      cells: [
        ...config.previousValues.map((item) => ({
          value: item.value ?? "",
          styleId: "headerNumber",
          type: item.value == null ? "String" : "Number",
        })),
        ...Array.from({ length: totalDateColumns }).map(() => ({
          value: "",
          styleId: "dateCell",
        })),
      ],
    },
  ];

  config.righe.forEach((riga) => {
    rows.push({
      height: 22,
      cells: [
        { value: riga.label, styleId: "label" },
        ...config.previousValues.map((_, index) => {
          const value = riga.previousValues[index] ?? null;
          return {
            value: value ?? "",
            styleId: "number",
            type: value == null ? "String" : "Number",
          };
        }),
        ...Array.from({ length: totalDateColumns }).map(() => ({
          value: "",
          styleId: riga.showDateCells === false ? "emptyBlocked" : "dateCell",
        })),
      ],
    });
  });

  const styles = [
    '<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Borders/><Font ss:FontName="Arial" ss:Size="9"/><Interior/><NumberFormat/><Protection/></Style>',
    '<Style ss:ID="title"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="14" ss:Bold="1"/></Style>',
    '<Style ss:ID="subtitle"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="9"/></Style>',
    '<Style ss:ID="headerLeft"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:FontName="Arial" ss:Size="8" ss:Bold="1"/></Style>',
    '<Style ss:ID="headerCenter"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:FontName="Arial" ss:Size="8" ss:Bold="1"/></Style>',
    '<Style ss:ID="headerSmall"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:FontName="Arial" ss:Size="8" ss:Bold="1"/></Style>',
    '<Style ss:ID="headerNumber"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:FontName="Arial" ss:Size="8" ss:Bold="1"/></Style>',
    '<Style ss:ID="label"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:FontName="Arial" ss:Size="8"/></Style>',
    '<Style ss:ID="number"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:FontName="Arial" ss:Size="8"/></Style>',
    '<Style ss:ID="dateCell"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders><Font ss:FontName="Arial" ss:Size="8"/></Style>',
    '<Style ss:ID="emptyBlocked"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>',
  ].join("");

  const xml = [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:html="http://www.w3.org/TR/REC-html40">',
    `<Styles>${styles}</Styles>`,
    `<Worksheet ss:Name="${xmlEscape(sheetName)}">`,
    `<Table>${columnsXml}${rows.map(buildRowXml).join("")}</Table>`,
    '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><PageSetup><Layout x:Orientation="Landscape"/></PageSetup><Selected/><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>',
    "</Worksheet>",
    "</Workbook>",
  ].join("");

  downloadXmlDocument(config.fileName, xml);
}
