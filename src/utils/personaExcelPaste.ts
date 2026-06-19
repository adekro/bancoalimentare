export type PastedPersona = {
  nome: string;
  cognome: string;
  data_nascita: string;
  nazione_nascita: string;
  nazionalita: string;
  sesso: "M" | "F" | "";
  extra_ue: boolean;
  paesi_terzi_ue: boolean;
  invalido: boolean;
};

export type NucleoIdentificazione = {
  numero_nucleo?: string;
  zona?: string;
  numero_tessera?: string;
  scadenza_tessera?: string;
  telefono?: string;
  indirizzo?: string;
  codice_fiscale_tesserato?: string;
  numero_componenti?: string;
};

export type ParsePasteResult = {
  persone: PastedPersona[];
  nucleo: NucleoIdentificazione;
};

function normalizzaData(s: string): string {
  const m = s.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
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

const ZONA_BY_GR: Record<string, string> = {
  S: "San Rocco",
  D: "Duomo",
  P: "Pombio",
  M: "Medassino",
};

export function parsePastedPersoneFromExcel(text: string): ParsePasteResult {
  const righe = text
    .split(/\r?\n/)
    .map((r) => r.split("\t").map((c) => c.trim()))
    .filter((r) => r.length >= 2 && r.some(Boolean));

  if (righe.length === 0) return { persone: [], nucleo: {} };

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

  // Nucleo identification column indices (header mode only)
  let iNr = -1;
  let iGr = -1;
  let iTess = -1;
  let iScad = -1;
  let iTel = -1;
  let iIndirizzo = -1;
  let iCodFisc = -1;
  let iNrComp = -1;

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

    // Nucleo identification columns
    iNr = primaNorm.findIndex(
      (c) => c === "NR" || c === "N R" || c.startsWith("NR FASC"),
    );
    iGr = primaNorm.findIndex(
      (c) => c === "GR" || c === "GR " || c === "GRUPPO",
    );
    iTess = primaNorm.findIndex((c) => c === "TESS" || c.startsWith("TESS"));
    iScad = primaNorm.findIndex((c) => c === "SCAD" || c.startsWith("SCAD"));
    iTel = primaNorm.findIndex(
      (c) => c.startsWith("TELEFONO") || c === "TEL",
    );
    iIndirizzo = primaNorm.findIndex((c) => c.startsWith("INDIRIZZO"));
    iCodFisc = primaNorm.findIndex((c) => c.includes("COD FISC"));
    iNrComp = primaNorm.findIndex(
      (c) => c === "NR COMP" || c.startsWith("NR COMP"),
    );
  } else {
    const ncol = righe[0].length;
    if (ncol >= 18) {
      // Formato FEAD fisso (senza intestazione):
      // A(0)=N°Nucleo  B(1)=Zona  C(2)=Cognome  D(3)=Nome  E(4)=NazNascita
      // F(5)=Sesso  G(6)=DataNascita  J(9)=Tessera  M(12)=Scadenza
      // O(14)=Telefono  P(15)=Indirizzo  Q(16)=CF  R(17)=Nazionalità  S(18)=PaesiTerziUE
      iCognome = 2;
      iNome = 3;
      iNazNascita = 4;
      iSesso = 5;
      iDataNascita = 6;
      iNazionalita = 17;
      iPaesiTerzi = 18;
      // colonne identificazione nucleo
      iNr = 0;
      iGr = 1;
      iTess = 9;
      iScad = 12;
      iTel = 14;
      iIndirizzo = 15;
      iCodFisc = 16;
    }
    const isOldHeader = ["cognome", "nome", "cf", "cod"].some((k) =>
      righe[0][0]?.toLowerCase().includes(k),
    );
    if (isOldHeader) headerIdx = 0;
  }

  const dati = headerIdx >= 0 ? righe.slice(1) : righe;

  const persone: PastedPersona[] = dati
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
      extra_ue: false,
      paesi_terzi_ue: iPaesiTerzi >= 0 ? normBool(r[iPaesiTerzi] ?? "") : false,
      invalido: iInvalido >= 0 ? normBool(r[iInvalido] ?? "") : false,
    }));

  // Extract nucleo identification from first non-empty value in each column
  const nucleo: NucleoIdentificazione = {};

  const firstNonEmpty = (idx: number): string => {
    if (idx < 0) return "";
    for (const r of dati) {
      const v = (r[idx] ?? "").trim();
      if (v) return v;
    }
    return "";
  };

  const nr = firstNonEmpty(iNr);
  if (nr) nucleo.numero_nucleo = nr;

  const gr = firstNonEmpty(iGr).toUpperCase();
  if (gr) nucleo.zona = ZONA_BY_GR[gr] ?? gr;

  const tess = firstNonEmpty(iTess);
  if (tess) nucleo.numero_tessera = tess;

  const scad = firstNonEmpty(iScad);
  if (scad) nucleo.scadenza_tessera = normalizzaData(scad);

  const tel = firstNonEmpty(iTel);
  if (tel) nucleo.telefono = tel;

  const indir = firstNonEmpty(iIndirizzo);
  if (indir) nucleo.indirizzo = indir;

  const cf = firstNonEmpty(iCodFisc);
  if (cf) nucleo.codice_fiscale_tesserato = cf.toUpperCase();

  // Numero componenti: usa colonna Excel se trovata (header mode),
  // altrimenti calcola dalle righe parsate
  if (iNrComp >= 0) {
    const nrComp = firstNonEmpty(iNrComp);
    if (nrComp) nucleo.numero_componenti = nrComp;
  }
  if (!nucleo.numero_componenti && persone.length > 0) {
    nucleo.numero_componenti = String(persone.length);
  }

  return { persone, nucleo };
}
