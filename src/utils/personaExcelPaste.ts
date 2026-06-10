export type PastedPersona = {
  nome: string;
  cognome: string;
  data_nascita: string;
  nazione_nascita: string;
  nazionalita: string;
  sesso: "M" | "F" | "";
  paesi_terzi_ue: boolean;
  invalido: boolean;
};

function normalizzaData(s: string): string {
  const m = s.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s.trim();
}

function normalizeHeaderCell(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normBool(v: string): boolean {
  return ["X", "SI", "S", "YES", "Y", "1", "TRUE"].includes(v.toUpperCase());
}

export function parsePastedPersoneFromExcel(text: string): PastedPersona[] {
  const righe = text
    .split(/\r?\n/)
    .map((r) => r.split("\t").map((c) => c.trim()))
    .filter((r) => r.length >= 2 && r.some(Boolean));

  if (righe.length === 0) return [];

  const primaNorm = righe[0].map(normalizeHeaderCell);
  const cogIdx = primaNorm.findIndex((c) => c.includes("COGNOME"));
  const nomIdx = primaNorm.findIndex(
    (c) => c === "NOME" || c.startsWith("NOME "),
  );

  let headerIdx = -1;
  let iCognome = 0;
  let iNome = 1;
  let iDataNascita = 2;
  let iNazNascita = -1;
  let iNazionalita = 3;
  let iSesso = -1;
  let iPaesiTerzi = -1;
  let iInvalido = -1;

  if (cogIdx >= 0 && nomIdx >= 0) {
    headerIdx = 0;
    iCognome = cogIdx;
    iNome = nomIdx;
    iDataNascita = primaNorm.findIndex(
      (c) => c === "DATA" || c.includes("DATA NASCITA"),
    );
    iNazNascita = primaNorm.findIndex(
      (c) => c === "NAZ NASCITA" || c.startsWith("NAZ NASCITA"),
    );
    iNazionalita = primaNorm.findIndex((c) => c === "NAZIONALITA");
    iSesso = primaNorm.findIndex(
      (c) => c === "M F" || c === "SESSO" || c === "SEX",
    );
    iPaesiTerzi = primaNorm.findIndex(
      (c) =>
        c === "PAESI TERZI" ||
        c.includes("PAESI TERZI UE") ||
        c.includes("EXTRA UE"),
    );
    iInvalido = primaNorm.findIndex((c) => c === "INV");
    if (iNazionalita < 0) iNazionalita = iNazNascita;
  } else {
    const ncol = righe[0].length;
    if (ncol >= 18) {
      iCognome = 2;
      iNome = 3;
      iNazNascita = 4;
      iSesso = 5;
      iDataNascita = 6;
      iInvalido = 13;
      iNazionalita = 17;
      iPaesiTerzi = 18;
    }
    const isOldHeader = ["cognome", "nome", "cf", "cod"].some((k) =>
      righe[0][0]?.toLowerCase().includes(k),
    );
    if (isOldHeader) headerIdx = 0;
  }

  const dati = headerIdx >= 0 ? righe.slice(1) : righe;

  return dati
    .filter((r) => r.some(Boolean))
    .map((r) => ({
      cognome: r[iCognome] ?? "",
      nome: r[iNome] ?? "",
      data_nascita:
        iDataNascita >= 0 && r[iDataNascita]
          ? normalizzaData(r[iDataNascita])
          : "",
      nazione_nascita: iNazNascita >= 0 ? (r[iNazNascita] ?? "") : "",
      nazionalita: iNazionalita >= 0 ? (r[iNazionalita] ?? "") : "",
      sesso:
        iSesso >= 0 && ["M", "F"].includes((r[iSesso] ?? "").toUpperCase())
          ? (r[iSesso].toUpperCase() as PastedPersona["sesso"])
          : "",
      paesi_terzi_ue: iPaesiTerzi >= 0 ? normBool(r[iPaesiTerzi] ?? "") : false,
      invalido: iInvalido >= 0 ? normBool(r[iInvalido] ?? "") : false,
    }));
}
