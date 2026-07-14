import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import PrintIcon from "@mui/icons-material/Print";
import { supabase } from "@/api/supabase";
import StatusChip from "@/components/common/StatusChip";
import {
  exportRiepilogoDistribuzioniDocXml,
  exportSpreadsheetXml,
} from "@/utils/exportSpreadsheetXml";

// ── Types ───────────────────────────────────────────────────────────────────

type Componente = {
  id: string;
  nucleo_id: string;
  ruolo: string;
  nome: string;
  cognome: string;
  codice_fiscale: string | null;
  data_nascita: string | null;
  nazionalita: string | null;
  nazione_nascita: string | null;
  sesso: string | null;
  extra_ue: boolean | null;
  paesi_terzi_ue: boolean | null;
  invalido: boolean | null;
  fascia_eta: string | null;
};

type Iscrizione = {
  id: string;
  numero_tessera: string;
  data_inizio: string | null;
  data_scadenza: string | null;
};

type Nucleo = {
  id: string;
  numero_nucleo_familiare: string | null;
  numero_componenti: number | null;
  codice_fiscale: string | null;
  telefono: string | null;
  indirizzo: string | null;
  zona: string;
  stato: "verde" | "nero" | "rosso";
  archiviato: boolean;
  componenti: Componente[];
  iscrizioni: Iscrizione[];
};

type Articolo = {
  id: string;
  nome: string;
  unita_misura: string;
  fondo: string;
};

type MovimentoRaw = {
  articolo_id: string;
  tipo: "carico" | "scarico";
  quantita_pezzi: number;
};

type GiacenzaRow = Articolo & { giacenza: number };

type DistribuzioneRaw = {
  id: string;
  centro: string;
  data: string;
  note: string | null;
};

type IscrizioneRaw = {
  id: string;
  numero_tessera: string;
  data_inizio: string | null;
  data_scadenza: string | null;
  note: string | null;
  created_at: string;
};

type StoricoEvent = {
  tipo: "iscrizione" | "distribuzione";
  data: string;
  descrizione: string;
};

type DistWithNucleoRaw = {
  id: string;
  data: string;
  numero_pacchi: number | null;
  centro: string;
  nuclei: {
    id: string;
    codice_fiscale: string | null;
    numero_componenti: number | null;
    zona: string;
    archiviato: boolean;
    componenti: Componente[];
    iscrizioni: Iscrizione[];
  } | null;
};

type UltimaDistribuzioneRow = {
  distribuzioneId: string;
  nucleoId: string;
  data: string;
  numeroPacchi: number | null;
  centro: string;
  zona: string;
  codiceFiscale: string | null;
  numeroTessera: string | null;
  scadenzaTessera: string | null;
  titolare: string;
};

type ConsegnaSettoreRow = {
  distribuzioneId: string;
  data: string;
  zona: string;
  titolare: string;
  codiceFiscale: string | null;
  numeroTessera: string | null;
  numeroPacchi: number | null;
  centro: string;
};

type RiepilogoDistribuzioniRow = {
  key: string;
  label: string;
  componentCount: number | null;
  precedenti: Record<string, number>;
  dateValues: Record<string, number>;
};

type RiepilogoDettaglioRow = {
  key: string;
  luogo: string;
  cognome: string;
  nome: string;
  tesseraPrecedente: string;
  tesseraAttuale: string;
  scadenzaTessera: string;
  componenti: number | null;
  precedenti: Record<string, number>;
  dateValues: Record<string, number>;
};

type RiepilogoDateOption = {
  key: string;
  label: string;
  date: string | null;
  center: string | null;
  sigla: string;
};

type SortDirection = "asc" | "desc";

// ── Constants ───────────────────────────────────────────────────────────────

const ZONE = ["Pombio", "Duomo", "Medassino", "San Rocco"] as const;
const FONDI = ["FSE+", "nazionale", "cofinanziato"];

const FASCIA_LABEL: Record<string, string> = {
  "0-17": "< 18 anni",
  "18-29": "18 – 29",
  "30-64": "30 – 64",
  "65+": "65+",
};
const FASCE_ORDINE = ["0-17", "18-29", "30-64", "65+"];

const NUCLEI_COLUMNS_CONFIG = [
  {
    id: "tessera",
    header: "N° Tessera",
    value: (n: Nucleo) => getUltimaIscrizione(n.iscrizioni)?.numero_tessera ?? "—",
    exportValue: (n: Nucleo) =>
      getUltimaIscrizione(n.iscrizioni)?.numero_tessera ?? "",
  },
  {
    id: "cf",
    header: "Codice Fiscale",
    value: (n: Nucleo) => n.codice_fiscale ?? "—",
    exportValue: (n: Nucleo) => n.codice_fiscale ?? "",
  },
  {
    id: "titolare",
    header: "Nominativo tesserato",
    value: (n: Nucleo) => {
      const t = getTitolare(n.componenti);
      return t ? `${t.cognome} ${t.nome}` : "—";
    },
    exportValue: (n: Nucleo) => {
      const t = getTitolare(n.componenti);
      return t ? `${t.cognome} ${t.nome}` : "";
    },
  },
  {
    id: "zona",
    header: "Zona",
    value: (n: Nucleo) => n.zona,
    exportValue: (n: Nucleo) => n.zona,
  },
  {
    id: "stato",
    header: "Stato",
    value: (n: Nucleo) => n.stato,
    exportValue: (n: Nucleo) => n.stato,
  },
  {
    id: "scadenza",
    header: "Scadenza",
    value: (n: Nucleo) => fmtData(getUltimaIscrizione(n.iscrizioni)?.data_scadenza),
    exportValue: (n: Nucleo) =>
      getUltimaIscrizione(n.iscrizioni)?.data_scadenza ?? "",
  },
  {
    id: "n_componenti",
    header: "N° Componenti (calcolato)",
    value: (n: Nucleo) => n.componenti.length,
    exportValue: (n: Nucleo) => n.componenti.length,
  },
  {
    id: "numero_nucleo",
    header: "N° Nucleo",
    value: (n: Nucleo) => n.numero_nucleo_familiare ?? "—",
    exportValue: (n: Nucleo) => n.numero_nucleo_familiare ?? "",
  },
  {
    id: "numero_componenti_db",
    header: "N° Componenti (db)",
    value: (n: Nucleo) => n.numero_componenti ?? "—",
    exportValue: (n: Nucleo) => n.numero_componenti ?? "",
  },
  {
    id: "telefono",
    header: "Telefono",
    value: (n: Nucleo) => n.telefono ?? "—",
    exportValue: (n: Nucleo) => n.telefono ?? "",
  },
  {
    id: "indirizzo",
    header: "Indirizzo",
    value: (n: Nucleo) => n.indirizzo ?? "—",
    exportValue: (n: Nucleo) => n.indirizzo ?? "",
  },
  {
    id: "cognome_p",
    header: "Cognome",
    value: (n: Nucleo) => getTitolare(n.componenti)?.cognome ?? "—",
    exportValue: (n: Nucleo) => getTitolare(n.componenti)?.cognome ?? "",
  },
  {
    id: "nome_p",
    header: "Nome",
    value: (n: Nucleo) => getTitolare(n.componenti)?.nome ?? "—",
    exportValue: (n: Nucleo) => getTitolare(n.componenti)?.nome ?? "",
  },
  {
    id: "cf_p",
    header: "CF Persona",
    value: (n: Nucleo) => getTitolare(n.componenti)?.codice_fiscale ?? "—",
    exportValue: (n: Nucleo) => getTitolare(n.componenti)?.codice_fiscale ?? "",
  },
  {
    id: "data_nascita_p",
    header: "Data Nascita",
    value: (n: Nucleo) => fmtData(getTitolare(n.componenti)?.data_nascita),
    exportValue: (n: Nucleo) => getTitolare(n.componenti)?.data_nascita ?? "",
  },
  {
    id: "nazione_nascita_p",
    header: "Nazione Nascita",
    value: (n: Nucleo) => getTitolare(n.componenti)?.nazione_nascita ?? "—",
    exportValue: (n: Nucleo) => getTitolare(n.componenti)?.nazione_nascita ?? "",
  },
  {
    id: "nazionalita_p",
    header: "Nazionalità",
    value: (n: Nucleo) => getTitolare(n.componenti)?.nazionalita ?? "—",
    exportValue: (n: Nucleo) => getTitolare(n.componenti)?.nazionalita ?? "",
  },
  {
    id: "sesso_p",
    header: "Sesso",
    value: (n: Nucleo) => getTitolare(n.componenti)?.sesso ?? "—",
    exportValue: (n: Nucleo) => getTitolare(n.componenti)?.sesso ?? "",
  },
  {
    id: "paesi_terzi_p",
    header: "Extra-UE",
    value: (n: Nucleo) =>
      getTitolare(n.componenti)?.paesi_terzi_ue ? "SI" : "NO",
    exportValue: (n: Nucleo) =>
      getTitolare(n.componenti)?.paesi_terzi_ue ? "SI" : "NO",
  },
  {
    id: "invalido_p",
    header: "Invalido",
    value: (n: Nucleo) => (getTitolare(n.componenti)?.invalido ? "SI" : "NO"),
    exportValue: (n: Nucleo) => (getTitolare(n.componenti)?.invalido ? "SI" : "NO"),
  },
  {
    id: "fascia_eta_p",
    header: "Fascia Età",
    value: (n: Nucleo) => {
      const t = getTitolare(n.componenti);
      if (!t) return "—";
      const f = t.fascia_eta ?? calcFascia(t.data_nascita);
      return FASCIA_LABEL[f] ?? f;
    },
    exportValue: (n: Nucleo) => {
      const t = getTitolare(n.componenti);
      if (!t) return "";
      return t.fascia_eta ?? calcFascia(t.data_nascita);
    },
  },
];

// ── Utilities ────────────────────────────────────────────────────────────────

function getTitolare(componenti: Componente[]): Componente | undefined {
  return (
    componenti.find((c) => c.ruolo === "titolare") ??
    componenti.find((c) => Boolean(c.codice_fiscale)) ??
    componenti.find((c) => c.ruolo === "capofamiglia")
  );
}

function getUltimaIscrizione(iscrizioni: Iscrizione[]): Iscrizione | undefined {
  return [...iscrizioni].sort((a, b) =>
    (b.data_inizio ?? "").localeCompare(a.data_inizio ?? ""),
  )[0];
}

function getPenultimaIscrizione(iscrizioni: Iscrizione[]): Iscrizione | undefined {
  return [...iscrizioni].sort((a, b) =>
    (b.data_inizio ?? "").localeCompare(a.data_inizio ?? ""),
  )[1];
}

function calcFascia(dataNascita: string | null): string {
  if (!dataNascita) return "?";
  const anni = Math.floor(
    (Date.now() - new Date(dataNascita).getTime()) /
      (365.25 * 24 * 3600 * 1000),
  );
  if (anni < 18) return "0-17";
  if (anni < 30) return "18-29";
  if (anni < 65) return "30-64";
  return "65+";
}

function fmtData(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}

function csvEscape(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "it", {
    numeric: true,
    sensitivity: "base",
  });
}

function normalizeComponentCount(
  nucleo: DistWithNucleoRaw["nuclei"],
): number | null {
  if (!nucleo) return null;
  if (nucleo.componenti.length > 0) return nucleo.componenti.length;
  if (
    typeof nucleo.numero_componenti === "number" &&
    Number.isFinite(nucleo.numero_componenti) &&
    nucleo.numero_componenti > 0
  ) {
    return nucleo.numero_componenti;
  }
  return null;
}

function sortCenterNames(values: string[]): string[] {
  const zoneIndex = new Map(ZONE.map((value, index) => [value, index]));
  return [...values].sort((a, b) => {
    const ai = zoneIndex.get(a);
    const bi = zoneIndex.get(b);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.localeCompare(b, "it", { sensitivity: "base" });
  });
}

const CENTRO_SIGLA: Record<string, string> = {
  Duomo: "D",
  Medassino: "M",
  Pombio: "P",
  "San Rocco": "S",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function Stampe() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nuclei, setNuclei] = useState<Nucleo[]>([]);
  const [filterZona, setFilterZona] = useState<string>("Tutte");
  const [dataStampaNuclei, setDataStampaNuclei] = useState(() =>
    new Date().toLocaleDateString("sv-SE"),
  );
  const [filterDataDa, setFilterDataDa] = useState("");
  const [filterDataA, setFilterDataA] = useState("");

  // Tab 3 — magazzino (lazy)
  const [giacenze, setGiacenze] = useState<GiacenzaRow[]>([]);
  const [loadingMag, setLoadingMag] = useState(false);
  const [magLoaded, setMagLoaded] = useState(false);

  // Tab 4 — storico nucleo
  const [storicoNucleo, setStoricoNucleo] = useState<Nucleo | null>(null);
  const [storicoEvents, setStoricoEvents] = useState<StoricoEvent[]>([]);
  const [loadingStorico, setLoadingStorico] = useState(false);

  // Tab 1-2 — distribuzioni (lazy)
  const [loadingDistribuzioni, setLoadingDistribuzioni] = useState(false);
  const [distribuzioniLoaded, setDistribuzioniLoaded] = useState(false);
  const [distRows, setDistRows] = useState<DistWithNucleoRaw[]>([]);
  const [selectedRiepilogoDates, setSelectedRiepilogoDates] = useState<
    RiepilogoDateOption[]
  >([]);
  const [riepilogoDettaglioMode, setRiepilogoDettaglioMode] = useState(false);
  const [riepilogoDialogOpen, setRiepilogoDialogOpen] = useState(false);
  const [riepilogoManualDate, setRiepilogoManualDate] = useState("");
  const [riepilogoManualCenter, setRiepilogoManualCenter] =
    useState<keyof typeof CENTRO_SIGLA>("Duomo");

  // Ordinamenti
  const [listaSortBy, setListaSortBy] = useState<
    "tessera" | "cf" | "titolare" | "zona" | "stato" | "scadenza"
  >("titolare");
  const [listaSortDir, setListaSortDir] = useState<SortDirection>("asc");
  const [ultimeSortBy, setUltimeSortBy] = useState<
    "data" | "titolare" | "zona" | "tessera" | "pacchi"
  >("data");
  const [ultimeSortDir, setUltimeSortDir] = useState<SortDirection>("desc");
  const [consegneSortBy, setConsegneSortBy] = useState<
    "data" | "zona" | "titolare" | "tessera" | "pacchi"
  >("zona");
  const [consegneSortDir, setConsegneSortDir] = useState<SortDirection>("asc");

  // Preferenze colonne Lista Nuclei
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => {
    const saved = localStorage.getItem("stampe_nuclei_columns");
    if (saved) {
      try {
        const savedColumns = JSON.parse(saved) as string[];
        return savedColumns.includes("titolare")
          ? savedColumns
          : [...savedColumns, "titolare"];
      } catch (e) {
        console.error("Errore nel parsing delle preferenze colonne", e);
      }
    }
    return ["tessera", "cf", "titolare", "zona", "stato", "scadenza"];
  });

  const availableDistribuzioneDates = useMemo<RiepilogoDateOption[]>(() => {
    const seen = new Set<string>();
    const items: RiepilogoDateOption[] = [];

    [...distRows]
      .sort((a, b) => b.data.localeCompare(a.data) || a.centro.localeCompare(b.centro))
      .forEach((row) => {
        const sigla = CENTRO_SIGLA[row.centro] ?? row.centro.slice(0, 1).toUpperCase();
        const key = `${row.data}|${sigla}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({
          key,
          label: `${fmtData(row.data)} ${sigla}`,
          date: row.data,
          center: row.centro,
          sigla,
        });
      });

    return items;
  }, [distRows]);

  useEffect(() => {
    if (availableDistribuzioneDates.length === 0) {
      setSelectedRiepilogoDates([]);
      return;
    }

    setSelectedRiepilogoDates((current) => {
      const validCurrent = current.filter((value) =>
        value.date === null ||
        availableDistribuzioneDates.some((option) => option.key === value.key),
      );
      if (validCurrent.length > 0) return validCurrent;
      const defaults: RiepilogoDateOption[] = [];
      const orderedCenters = ["Duomo", "Medassino", "Pombio", "San Rocco"];
      orderedCenters.forEach((center) => {
        const found = availableDistribuzioneDates.find((option) => option.center === center);
        if (found) defaults.push(found);
      });
      return defaults.length > 0 ? defaults : availableDistribuzioneDates.slice(0, 4);
    });
  }, [availableDistribuzioneDates]);

  useEffect(() => {
    localStorage.setItem(
      "stampe_nuclei_columns",
      JSON.stringify(visibleColumnKeys),
    );
  }, [visibleColumnKeys]);

  // ── Carica nuclei all'avvio ───────────────────────────────────────────────
  useEffect(() => {
    async function carica() {
      setLoading(true);
      const { data, error } = await supabase
        .from("nuclei")
        .select(
          "id, numero_nucleo_familiare, numero_componenti, codice_fiscale, telefono, indirizzo, zona, stato, archiviato, " +
            "componenti(*), " +
            "iscrizioni(id, numero_tessera, data_inizio, data_scadenza)",
        )
        .eq("archiviato", false)
        .order("zona");
      if (!error && data) setNuclei(data as unknown as Nucleo[]);
      setLoading(false);
    }
    carica();
  }, []);

  // ── Carica magazzino al primo accesso al tab 3 ───────────────────────────
  useEffect(() => {
    if (tab !== 99 || magLoaded) return;
    async function caricaMag() {
      setLoadingMag(true);
      const [{ data: articoli }, { data: movimenti }] = await Promise.all([
        supabase.from("articoli").select("id, nome, unita_misura, fondo"),
        supabase
          .from("movimenti_magazzino")
          .select("articolo_id, tipo, quantita_pezzi"),
      ]);
      if (articoli) {
        const movMap: Record<string, number> = {};
        ((movimenti as MovimentoRaw[] | null) ?? []).forEach((m) => {
          movMap[m.articolo_id] =
            (movMap[m.articolo_id] ?? 0) +
            (m.tipo === "carico" ? m.quantita_pezzi : -m.quantita_pezzi);
        });
        const rows: GiacenzaRow[] = (articoli as Articolo[]).map((a) => ({
          ...a,
          giacenza: movMap[a.id] ?? 0,
        }));
        rows.sort(
          (a, b) =>
            a.fondo.localeCompare(b.fondo) || a.nome.localeCompare(b.nome),
        );
        setGiacenze(rows);
      }
      setLoadingMag(false);
      setMagLoaded(true);
    }
    caricaMag();
  }, [tab, magLoaded]);

  // ── Carica distribuzioni al primo accesso tab 1 o 2 ─────────────────────
  useEffect(() => {
    if (![1, 2].includes(tab) || distribuzioniLoaded) return;
    async function caricaDistribuzioni() {
      setLoadingDistribuzioni(true);
      const { data } = await supabase
        .from("distribuzioni")
        .select(
          "id, data, numero_pacchi, centro, " +
            "nuclei!inner(id, codice_fiscale, numero_componenti, zona, archiviato, componenti(*), iscrizioni(id, numero_tessera, data_inizio, data_scadenza))",
        )
        .order("data", { ascending: false });
      setDistRows((data as DistWithNucleoRaw[] | null) ?? []);
      setLoadingDistribuzioni(false);
      setDistribuzioniLoaded(true);
    }
    caricaDistribuzioni();
  }, [tab, distribuzioniLoaded]);

  // ── Carica storico quando cambia nucleo selezionato ──────────────────────
  useEffect(() => {
    if (!storicoNucleo) {
      setStoricoEvents([]);
      return;
    }
    async function caricaStorico() {
      setLoadingStorico(true);
      const [{ data: isc }, { data: dist }] = await Promise.all([
        supabase
          .from("iscrizioni")
          .select(
            "id, numero_tessera, data_inizio, data_scadenza, note, created_at",
          )
          .eq("nucleo_id", storicoNucleo.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("distribuzioni")
          .select("id, centro, data, note")
          .eq("nucleo_id", storicoNucleo.id)
          .order("data", { ascending: false }),
      ]);
      const events: StoricoEvent[] = [];
      ((isc as IscrizioneRaw[] | null) ?? []).forEach((i) => {
        events.push({
          tipo: "iscrizione",
          data: i.data_inizio ?? i.created_at,
          descrizione: `Tessera N° ${i.numero_tessera} — scad. ${fmtData(i.data_scadenza)}${i.note ? ` (${i.note})` : ""}`,
        });
      });
      ((dist as DistribuzioneRaw[] | null) ?? []).forEach((d) => {
        events.push({
          tipo: "distribuzione",
          data: d.data,
          descrizione: `Distribuzione — ${d.centro}${d.note ? ` — ${d.note}` : ""}`,
        });
      });
      events.sort((a, b) => b.data.localeCompare(a.data));
      setStoricoEvents(events);
      setLoadingStorico(false);
    }
    caricaStorico();
  }, [storicoNucleo]);

  // ── Dati derivati (condivisi tra tab) ────────────────────────────────────

  const nucleiFiltrati = [...nuclei]
    .filter((n) => filterZona === "Tutte" || n.zona === filterZona)
    .sort((a, b) => {
      const ta = getTitolare(a.componenti);
      const tb = getTitolare(b.componenti);
      const ua = getUltimaIscrizione(a.iscrizioni);
      const ub = getUltimaIscrizione(b.iscrizioni);
      const va = {
        tessera: ua?.numero_tessera ?? null,
        cf: a.codice_fiscale,
        titolare: ta ? `${ta.cognome} ${ta.nome}` : null,
        zona: a.zona,
        stato: a.stato,
        scadenza: ua?.data_scadenza ?? null,
      }[listaSortBy];
      const vb = {
        tessera: ub?.numero_tessera ?? null,
        cf: b.codice_fiscale,
        titolare: tb ? `${tb.cognome} ${tb.nome}` : null,
        zona: b.zona,
        stato: b.stato,
        scadenza: ub?.data_scadenza ?? null,
      }[listaSortBy];
      const cmp = compareValues(va, vb);
      return listaSortDir === "asc" ? cmp : -cmp;
    });

  const distFiltrate = distRows
    .filter((d) => d.nuclei && !d.nuclei.archiviato)
    .filter((d) => filterZona === "Tutte" || d.nuclei?.zona === filterZona)
    .filter((d) => !filterDataDa || d.data >= filterDataDa)
    .filter((d) => !filterDataA || d.data <= filterDataA);

  const ultimeDistribuzioniRows: UltimaDistribuzioneRow[] = (() => {
    const latestByNucleo = new Map<string, DistWithNucleoRaw>();
    distFiltrate.forEach((d) => {
      if (!d.nuclei) return;
      const current = latestByNucleo.get(d.nuclei.id);
      if (!current || d.data > current.data) latestByNucleo.set(d.nuclei.id, d);
    });

    const rows = [...latestByNucleo.values()].map((d) => {
      const nucleo = d.nuclei!;
      const titolareObj = getTitolare(nucleo.componenti);
      const ultima = getUltimaIscrizione(nucleo.iscrizioni);
      return {
        distribuzioneId: d.id,
        nucleoId: nucleo.id,
        data: d.data,
        numeroPacchi: d.numero_pacchi,
        centro: d.centro,
        zona: nucleo.zona,
        codiceFiscale: nucleo.codice_fiscale,
        numeroTessera: ultima?.numero_tessera ?? null,
        scadenzaTessera: ultima?.data_scadenza ?? null,
        titolare: titolareObj
          ? `${titolareObj.cognome} ${titolareObj.nome}`
          : "—",
      };
    });

    return rows.sort((a, b) => {
      const va = {
        data: a.data,
        titolare: a.titolare,
        zona: a.zona,
        tessera: a.numeroTessera,
        pacchi: a.numeroPacchi,
      }[ultimeSortBy];
      const vb = {
        data: b.data,
        titolare: b.titolare,
        zona: b.zona,
        tessera: b.numeroTessera,
        pacchi: b.numeroPacchi,
      }[ultimeSortBy];
      const cmp = compareValues(va, vb);
      return ultimeSortDir === "asc" ? cmp : -cmp;
    });
  })();

  const consegneSettoreRows: ConsegnaSettoreRow[] = distFiltrate
    .map((d) => {
      if (!d.nuclei) return null;
      const titolareObj = getTitolare(d.nuclei.componenti);
      const ultima = getUltimaIscrizione(d.nuclei.iscrizioni);
      return {
        distribuzioneId: d.id,
        data: d.data,
        zona: d.nuclei.zona,
        titolare: titolareObj
          ? `${titolareObj.cognome} ${titolareObj.nome}`
          : "—",
        codiceFiscale: d.nuclei.codice_fiscale,
        numeroTessera: ultima?.numero_tessera ?? null,
        numeroPacchi: d.numero_pacchi,
        centro: d.centro,
      };
    })
    .filter((r): r is ConsegnaSettoreRow => !!r)
    .sort((a, b) => {
      const va = {
        data: a.data,
        zona: a.zona,
        titolare: a.titolare,
        tessera: a.numeroTessera,
        pacchi: a.numeroPacchi,
      }[consegneSortBy];
      const vb = {
        data: b.data,
        zona: b.zona,
        titolare: b.titolare,
        tessera: b.numeroTessera,
        pacchi: b.numeroPacchi,
      }[consegneSortBy];
      const cmp = compareValues(va, vb);
      return consegneSortDir === "asc" ? cmp : -cmp;
    });

  const riepilogoDateColumns = [...selectedRiepilogoDates].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.label.localeCompare(b.label, "it", { sensitivity: "base" });
  });

  const riepilogoRows = useMemo<RiepilogoDistribuzioniRow[]>(() => {
    const selectedRealDates = riepilogoDateColumns
      .filter((item) => Boolean(item.date));
    if (riepilogoDateColumns.length === 0) return [];

    const firstSelectedDate = selectedRealDates[0]?.date ?? null;
    const filteredRows = distRows.filter((row) => {
      if (!row.nuclei || row.nuclei.archiviato) return false;
      if (filterZona !== "Tutte" && row.nuclei.zona !== filterZona) return false;
      return true;
    });

    const previousCenters = sortCenterNames([
      ...new Set(
        filteredRows
          .filter((row) => !firstSelectedDate || row.data < firstSelectedDate)
          .map((row) => row.centro)
          .filter(Boolean),
      ),
    ]);

    const countsBySize = new Map<
      number,
      {
        precedenti: Record<string, number>;
        dateValues: Record<string, number>;
      }
    >();

    let maxSize = 9;
    for (const row of filteredRows) {
      const componentCount = normalizeComponentCount(row.nuclei);
      if (!componentCount || componentCount < 1) continue;
      maxSize = Math.max(maxSize, componentCount);

      let target = countsBySize.get(componentCount);
      if (!target) {
        target = { precedenti: {}, dateValues: {} };
        countsBySize.set(componentCount, target);
      }

      const rowSigla =
        CENTRO_SIGLA[row.centro] ?? row.centro.slice(0, 1).toUpperCase();
      const rowDateKey = `${row.data}|${rowSigla}`;

      if (firstSelectedDate && row.data < firstSelectedDate) {
        target.precedenti[row.centro] = (target.precedenti[row.centro] ?? 0) + 1;
      }
      if (riepilogoDateColumns.some((item) => item.key === rowDateKey)) {
        target.dateValues[rowDateKey] = (target.dateValues[rowDateKey] ?? 0) + 1;
      }
    }

    const rows: RiepilogoDistribuzioniRow[] = [];
    for (let size = 1; size <= maxSize; size += 1) {
      const bucket = countsBySize.get(size);
      const precedenti = Object.fromEntries(
        previousCenters.map((center) => [center, bucket?.precedenti[center] ?? 0]),
      );
      const dateValues = Object.fromEntries(
        riepilogoDateColumns.map((item) => [item.key, bucket?.dateValues[item.key] ?? 0]),
      );

      rows.push({
        key: `size-${size}`,
        label: `TOTALE BORSE ${size} PERSON${size === 1 ? "A" : "E"}`,
        componentCount: size,
        precedenti,
        dateValues,
      });
    }

    const totalPrecedenti = Object.fromEntries(
      previousCenters.map((center) => [
        center,
        rows.reduce((sum, row) => sum + (row.precedenti[center] ?? 0), 0),
      ]),
    );

    rows.push({
      key: "total",
      label: "TOTALE",
      componentCount: null,
      precedenti: totalPrecedenti,
      dateValues: Object.fromEntries(
        riepilogoDateColumns.map((item) => [
          item.key,
          rows.reduce((sum, row) => sum + (row.dateValues[item.key] ?? 0), 0),
        ]),
      ),
    });

    return rows;
  }, [distRows, filterZona, riepilogoDateColumns]);

  const riepilogoDettaglioRows = useMemo<RiepilogoDettaglioRow[]>(() => {
    if (riepilogoDateColumns.length === 0) return [];

    const selectedRealDates = riepilogoDateColumns.filter((item) => Boolean(item.date));
    const firstSelectedDate = selectedRealDates[0]?.date ?? null;
    const filteredRows = distRows.filter((row) => {
      if (!row.nuclei || row.nuclei.archiviato) return false;
      if (filterZona !== "Tutte" && row.nuclei.zona !== filterZona) return false;
      return true;
    });

    const previousCenters = sortCenterNames([
      ...new Set(
        filteredRows
          .filter((row) => !firstSelectedDate || row.data < firstSelectedDate)
          .map((row) => row.centro)
          .filter(Boolean),
      ),
    ]);

    const byNucleo = new Map<string, RiepilogoDettaglioRow>();

    for (const row of filteredRows) {
      const nucleo = row.nuclei;
      if (!nucleo) continue;
      const titolare = getTitolare(nucleo.componenti);
      const ultima = getUltimaIscrizione(nucleo.iscrizioni);
      const penultima = getPenultimaIscrizione(nucleo.iscrizioni);
      const componenti = normalizeComponentCount(nucleo);
      const rowSigla =
        CENTRO_SIGLA[row.centro] ?? row.centro.slice(0, 1).toUpperCase();
      const rowDateKey = `${row.data}|${rowSigla}`;

      let entry = byNucleo.get(nucleo.id);
      if (!entry) {
        entry = {
          key: nucleo.id,
          luogo: nucleo.zona,
          cognome: titolare?.cognome ?? "",
          nome: titolare?.nome ?? "",
          tesseraPrecedente: penultima?.numero_tessera ?? "",
          tesseraAttuale: ultima?.numero_tessera ?? "",
          scadenzaTessera: fmtData(ultima?.data_scadenza),
          componenti,
          precedenti: Object.fromEntries(previousCenters.map((center) => [center, 0])),
          dateValues: Object.fromEntries(
            riepilogoDateColumns.map((item) => [item.key, 0]),
          ),
        };
        byNucleo.set(nucleo.id, entry);
      }

      if (firstSelectedDate && row.data < firstSelectedDate) {
        entry.precedenti[row.centro] = (entry.precedenti[row.centro] ?? 0) + 1;
      }
      if (riepilogoDateColumns.some((item) => item.key === rowDateKey)) {
        entry.dateValues[rowDateKey] = (entry.dateValues[rowDateKey] ?? 0) + 1;
      }
    }

    return [...byNucleo.values()].sort((a, b) => {
      const luogoCmp = a.luogo.localeCompare(b.luogo, "it", { sensitivity: "base" });
      if (luogoCmp !== 0) return luogoCmp;
      const cognomeCmp = a.cognome.localeCompare(b.cognome, "it", { sensitivity: "base" });
      if (cognomeCmp !== 0) return cognomeCmp;
      return a.nome.localeCompare(b.nome, "it", { sensitivity: "base" });
    });
  }, [distRows, filterZona, riepilogoDateColumns]);

  const allComponenti = nuclei.flatMap((n) => n.componenti);

  const fasciaCount: Record<string, number> = {};
  const nazCount: Record<string, number> = {};
  let invalidiCount = 0;
  let paesiTerziCount = 0;

  allComponenti.forEach((c) => {
    const fascia = c.fascia_eta ?? calcFascia(c.data_nascita);
    fasciaCount[fascia] = (fasciaCount[fascia] ?? 0) + 1;
    const naz = c.nazionalita ?? "Non specificata";
    nazCount[naz] = (nazCount[naz] ?? 0) + 1;
    if (c.invalido) invalidiCount++;
    if (c.paesi_terzi_ue) paesiTerziCount++;
  });

  const topNaz = Object.entries(nazCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const altreNaz =
    Object.values(nazCount).reduce((s, v) => s + v, 0) -
    topNaz.reduce((s, [, v]) => s + v, 0);

  // ── CSV Export ───────────────────────────────────────────────────────────

  function esportaCSV() {
    const header = [
      "cf_nucleo",
      "zona",
      "stato",
      "numero_tessera",
      "scadenza_tessera",
      "nome",
      "cognome",
      "data_nascita",
      "fascia_eta",
      "nazionalita",
      "sesso",
      "invalido",
      "paesi_terzi_ue",
      "ruolo",
    ].join(",");

    const nucleiDaEsportare =
      filterZona === "Tutte"
        ? nuclei
        : nuclei.filter((n) => n.zona === filterZona);

    const rows = nucleiDaEsportare.flatMap((n) => {
      const ultima = getUltimaIscrizione(n.iscrizioni);
      return n.componenti.map((c) =>
        [
          csvEscape(n.codice_fiscale),
          csvEscape(n.zona),
          csvEscape(n.stato),
          csvEscape(ultima?.numero_tessera),
          csvEscape(ultima?.data_scadenza),
          csvEscape(c.nome),
          csvEscape(c.cognome),
          csvEscape(c.data_nascita),
          csvEscape(c.fascia_eta ?? calcFascia(c.data_nascita)),
          csvEscape(c.nazionalita),
          csvEscape(c.sesso),
          csvEscape(c.invalido != null ? (c.invalido ? "SI" : "NO") : null),
          csvEscape(
            c.paesi_terzi_ue != null ? (c.paesi_terzi_ue ? "SI" : "NO") : null,
          ),
          csvEscape(c.ruolo),
        ].join(","),
      );
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nuclei_fse_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function esportaListaNucleiXML() {
    exportSpreadsheetXml(
      nucleiFiltrati,
      NUCLEI_COLUMNS_CONFIG.filter((c) => visibleColumnKeys.includes(c.id)).map(
        (col) => ({
          header: col.header,
          value: col.exportValue,
        }),
      ),
      `lista_nuclei_${new Date().toISOString().slice(0, 10)}.xls`,
      "ListaNuclei",
    );
  }

  function esportaUltimeDistribuzioniXML() {
    exportSpreadsheetXml(
      ultimeDistribuzioniRows,
      [
        { header: "Data distribuzione", value: (r) => r.data },
        { header: "Zona", value: (r) => r.zona },
        { header: "Titolare", value: (r) => r.titolare },
        { header: "Codice fiscale", value: (r) => r.codiceFiscale ?? "" },
        { header: "Numero tessera", value: (r) => r.numeroTessera ?? "" },
        { header: "Scadenza tessera", value: (r) => r.scadenzaTessera ?? "" },
        { header: "Numero pacchi", value: (r) => r.numeroPacchi ?? "" },
        { header: "Centro", value: (r) => r.centro },
      ],
      `ultime_distribuzioni_${new Date().toISOString().slice(0, 10)}.xls`,
      "UltimeDistribuzioni",
    );
  }

  function esportaConsegneSettoreXML() {
    exportSpreadsheetXml(
      consegneSettoreRows,
      [
        { header: "Data consegna", value: (r) => r.data },
        { header: "Settore (zona)", value: (r) => r.zona },
        { header: "Titolare tessera", value: (r) => r.titolare },
        {
          header: "Codice fiscale nucleo",
          value: (r) => r.codiceFiscale ?? "",
        },
        { header: "Numero tessera", value: (r) => r.numeroTessera ?? "" },
        { header: "Numero pacchi", value: (r) => r.numeroPacchi ?? "" },
        { header: "Centro", value: (r) => r.centro },
      ],
      `consegne_settore_${new Date().toISOString().slice(0, 10)}.xls`,
      "ConsegneSettore",
    );
  }

  function esportaRiepilogoDistribuzioniDoc() {
    if (
      riepilogoDateColumns.length === 0 ||
      (!riepilogoDettaglioMode && riepilogoRows.length === 0) ||
      (riepilogoDettaglioMode && riepilogoDettaglioRows.length === 0)
    ) {
      return;
    }

    const orderedCenters = ["Duomo", "Medassino", "Pombio", "San Rocco"];
    const previousValues = orderedCenters.map((center) => ({
      label: CENTRO_SIGLA[center],
      value:
        riepilogoRows.find((row) => row.key === "total")?.precedenti[center] ?? 0,
    }));

    exportRiepilogoDistribuzioniDocXml({
      fileName: `riepilogo_distribuzioni_${new Date().toISOString().slice(0, 10)}.xls`,
      sheetName: "Riepilogo",
      titolo: `ELENCO FAMIGLIE ASSISTITE ${new Date().getFullYear()}`,
      zonaLabel:
        filterZona === "Tutte"
          ? "Zona: tutte"
          : `Zona: ${filterZona}`,
      dateLabels: riepilogoDateColumns.map((item) => item.label),
      previousLegend: "PRECEDENTI",
      detailHeaders: riepilogoDettaglioMode
        ? [
            "LUOGO",
            "COGNOMI",
            "NOMI",
            "TESSERA PREC.",
            "TESSERA ATT.",
            "SCADENZA",
            "COMP.",
          ]
        : undefined,
      previousValues,
      righe: riepilogoDettaglioMode
        ? riepilogoDettaglioRows.map((row) => ({
            leftValues: [
              row.luogo,
              row.cognome,
              row.nome,
              row.tesseraPrecedente,
              row.tesseraAttuale,
              row.scadenzaTessera,
              row.componenti ?? "",
            ],
            previousValues: orderedCenters.map((center) => row.precedenti[center] ?? 0),
            dateValues: riepilogoDateColumns.map((item) => row.dateValues[item.key] ?? null),
          }))
        : riepilogoRows.map((row) => ({
            leftValues: [row.label],
            previousValues: orderedCenters.map((center) => row.precedenti[center] ?? 0),
            dateValues: riepilogoDateColumns.map((item) => row.dateValues[item.key] ?? null),
          })),
    });
  }

  function aggiungiRiepilogoManuale() {
    if (!riepilogoManualDate) return;
    const sigla = CENTRO_SIGLA[riepilogoManualCenter];
    const key = `manual:${riepilogoManualDate}|${sigla}`;
    const nextItem: RiepilogoDateOption = {
      key,
      label: `${fmtData(riepilogoManualDate)} ${sigla}`,
      date: riepilogoManualDate,
      center: riepilogoManualCenter,
      sigla,
    };

    setSelectedRiepilogoDates((current) => {
      if (current.some((item) => item.key === key)) return current;
      return [...current, nextItem];
    });
    setRiepilogoDialogOpen(false);
    setRiepilogoManualDate("");
    setRiepilogoManualCenter("Duomo");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}
        className="no-print"
      >
        <PrintIcon color="primary" />
        <Typography variant="h5">Stampe e Reportistica</Typography>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }} className="no-print">
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Lista Nuclei" />
          <Tab label="Ultime Distribuzioni" />
          <Tab label="Riepilogo Distribuzioni" />
          <Tab label="Report FSE+" />
          <Tab label="Esporta CSV" />
          <Tab label="Storico Nucleo" />
        </Tabs>
      </Paper>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* ═══════════════ TAB 0 — Lista Nuclei ═══════════════ */}
          {tab === 0 && (
            <Box>
              {/* Controlli (nascosti in stampa) */}
              <Box
                className="no-print"
                sx={{
                  display: "flex",
                  gap: 2,
                  mb: 2,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Zona</InputLabel>
                  <Select
                    value={filterZona}
                    label="Zona"
                    onChange={(e) => setFilterZona(e.target.value)}
                  >
                    <MenuItem value="Tutte">Tutte</MenuItem>
                    {ZONE.map((z) => (
                      <MenuItem key={z} value={z}>
                        {z}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Ordina per</InputLabel>
                  <Select
                    value={listaSortBy}
                    label="Ordina per"
                    onChange={(e) =>
                      setListaSortBy(e.target.value as typeof listaSortBy)
                    }
                  >
                    <MenuItem value="titolare">Nominativo</MenuItem>
                    <MenuItem value="tessera">N° Tessera</MenuItem>
                    <MenuItem value="cf">Codice Fiscale</MenuItem>
                    <MenuItem value="zona">Zona</MenuItem>
                    <MenuItem value="stato">Stato</MenuItem>
                    <MenuItem value="scadenza">Scadenza</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Direzione</InputLabel>
                  <Select
                    value={listaSortDir}
                    label="Direzione"
                    onChange={(e) =>
                      setListaSortDir(e.target.value as SortDirection)
                    }
                  >
                    <MenuItem value="asc">Crescente</MenuItem>
                    <MenuItem value="desc">Decrescente</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  type="date"
                  label="Data stampa"
                  value={dataStampaNuclei}
                  onChange={(e) => setDataStampaNuclei(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ minWidth: 160 }}
                />
                <Autocomplete
                  multiple
                  size="small"
                  options={NUCLEI_COLUMNS_CONFIG}
                  getOptionLabel={(option) => option.header}
                  value={NUCLEI_COLUMNS_CONFIG.filter((c) =>
                    visibleColumnKeys.includes(c.id),
                  )}
                  onChange={(_, newValue) => {
                    setVisibleColumnKeys(newValue.map((v) => v.id));
                  }}
                  disableCloseOnSelect
                  renderInput={(params) => (
                    <TextField {...params} label="Colonne" placeholder="Aggiungi..." />
                  )}
                  sx={{ minWidth: 250, maxWidth: 400 }}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        label={option.header}
                        {...getTagProps({ index })}
                        size="small"
                      />
                    ))
                  }
                />
                <Typography variant="body2" color="text.secondary">
                  {nucleiFiltrati.length} nuclei
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={esportaListaNucleiXML}
                >
                  Export XML (.xls)
                </Button>
                <Button
                  variant="contained"
                  startIcon={<PrintIcon />}
                  onClick={() => window.print()}
                >
                  Stampa
                </Button>
              </Box>

              {/* Titolo visibile solo in stampa */}
              <Typography
                variant="h6"
                sx={{
                  mb: 2,
                  display: "none",
                  "@media print": { display: "block" },
                }}
              >
                Lista Nuclei
                {filterZona !== "Tutte" ? ` — Zona ${filterZona}` : ""} —{" "}
                {fmtData(dataStampaNuclei)}
              </Typography>

              <TableContainer component={Paper} elevation={1}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "primary.main" }}>
                      {NUCLEI_COLUMNS_CONFIG.filter((c) =>
                        visibleColumnKeys.includes(c.id),
                      ).map((col) => (
                        <TableCell
                          key={col.id}
                          sx={{ color: "white", fontWeight: 700 }}
                        >
                          {col.header}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {nucleiFiltrati.map((n, i) => (
                      <TableRow
                        key={n.id}
                        sx={{
                          backgroundColor:
                            i % 2 === 0 ? "transparent" : "action.hover",
                        }}
                      >
                        {NUCLEI_COLUMNS_CONFIG.filter((c) =>
                          visibleColumnKeys.includes(c.id),
                        ).map((col) => (
                          <TableCell key={col.id}>
                            {col.id === "stato" ? (
                              <StatusChip stato={n.stato} />
                            ) : (
                              col.value(n)
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {nucleiFiltrati.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={visibleColumnKeys.length}
                          align="center"
                          sx={{ py: 4, color: "text.secondary" }}
                        >
                          Nessun nucleo trovato
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* ═══════════════ TAB 1 — Ultime Distribuzioni ═══════════════ */}
          {tab === 1 && (
            <Box>
              <Box
                className="no-print"
                sx={{
                  display: "flex",
                  gap: 2,
                  mb: 2,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Zona</InputLabel>
                  <Select
                    value={filterZona}
                    label="Zona"
                    onChange={(e) => setFilterZona(e.target.value)}
                  >
                    <MenuItem value="Tutte">Tutte</MenuItem>
                    {ZONE.map((z) => (
                      <MenuItem key={z} value={z}>
                        {z}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Data da"
                  type="date"
                  size="small"
                  value={filterDataDa}
                  onChange={(e) => setFilterDataDa(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="Data a"
                  type="date"
                  size="small"
                  value={filterDataA}
                  onChange={(e) => setFilterDataA(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
                <FormControl size="small" sx={{ minWidth: 170 }}>
                  <InputLabel>Ordina per</InputLabel>
                  <Select
                    value={ultimeSortBy}
                    label="Ordina per"
                    onChange={(e) =>
                      setUltimeSortBy(e.target.value as typeof ultimeSortBy)
                    }
                  >
                    <MenuItem value="data">Data</MenuItem>
                    <MenuItem value="titolare">Titolare</MenuItem>
                    <MenuItem value="zona">Zona</MenuItem>
                    <MenuItem value="tessera">N° Tessera</MenuItem>
                    <MenuItem value="pacchi">Pacchi</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Direzione</InputLabel>
                  <Select
                    value={ultimeSortDir}
                    label="Direzione"
                    onChange={(e) =>
                      setUltimeSortDir(e.target.value as SortDirection)
                    }
                  >
                    <MenuItem value="asc">Crescente</MenuItem>
                    <MenuItem value="desc">Decrescente</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="body2" color="text.secondary">
                  {ultimeDistribuzioniRows.length} nuclei
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={esportaUltimeDistribuzioniXML}
                >
                  Export XML (.xls)
                </Button>
                <Button
                  variant="contained"
                  startIcon={<PrintIcon />}
                  onClick={() => window.print()}
                >
                  Stampa
                </Button>
              </Box>

              {loadingDistribuzioni ? (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <TableContainer component={Paper} elevation={1}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: "primary.main" }}>
                        {[
                          "Data",
                          "Titolare",
                          "Zona",
                          "N° Tessera",
                          "CF Nucleo",
                          "Pacchi",
                          "Centro",
                        ].map((h) => (
                          <TableCell
                            key={h}
                            sx={{ color: "white", fontWeight: 700 }}
                          >
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {ultimeDistribuzioniRows.map((r, i) => (
                        <TableRow
                          key={r.distribuzioneId}
                          sx={{
                            backgroundColor:
                              i % 2 === 0 ? "transparent" : "action.hover",
                          }}
                        >
                          <TableCell>{fmtData(r.data)}</TableCell>
                          <TableCell>{r.titolare}</TableCell>
                          <TableCell>{r.zona}</TableCell>
                          <TableCell>{r.numeroTessera ?? "—"}</TableCell>
                          <TableCell>{r.codiceFiscale ?? "—"}</TableCell>
                          <TableCell>{r.numeroPacchi ?? "—"}</TableCell>
                          <TableCell>{r.centro}</TableCell>
                        </TableRow>
                      ))}
                      {ultimeDistribuzioniRows.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            align="center"
                            sx={{ py: 4, color: "text.secondary" }}
                          >
                            Nessuna distribuzione trovata
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {/* ═══════════════ TAB 1 — Report FSE+ ═══════════════ */}
          {tab === 2 && (
            <Box>
              <Box
                className="no-print"
                sx={{
                  display: "flex",
                  gap: 2,
                  mb: 2,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Zona</InputLabel>
                  <Select
                    value={filterZona}
                    label="Zona"
                    onChange={(e) => setFilterZona(e.target.value)}
                  >
                    <MenuItem value="Tutte">Tutte</MenuItem>
                    {ZONE.map((z) => (
                      <MenuItem key={z} value={z}>
                        {z}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Autocomplete
                  multiple
                  size="small"
                  options={availableDistribuzioneDates}
                  value={selectedRiepilogoDates}
                  onChange={(_, newValue) => setSelectedRiepilogoDates(newValue)}
                  getOptionLabel={(option) => option.label}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Date distribuzione"
                      placeholder="Scegli date occupate"
                    />
                  )}
                  sx={{ minWidth: 320, flex: 1, maxWidth: 680 }}
                  isOptionEqualToValue={(option, value) => option.key === value.key}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => (
                      <Chip
                        label={option.label}
                        {...getTagProps({ index })}
                        size="small"
                      />
                    ))
                  }
                />
                <Typography variant="body2" color="text.secondary">
                  {riepilogoDateColumns.length} date
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={riepilogoDettaglioMode}
                      onChange={(e) => setRiepilogoDettaglioMode(e.target.checked)}
                    />
                  }
                  label="Dettaglio famiglie"
                />
                <Button
                  variant="outlined"
                  onClick={() => setRiepilogoDialogOpen(true)}
                >
                  Aggiungi libera
                </Button>
                <Box sx={{ flexGrow: 1 }} />
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={esportaRiepilogoDistribuzioniDoc}
                  disabled={riepilogoDateColumns.length === 0}
                >
                  Scarica .xls XML
                </Button>
              </Box>

              {loadingDistribuzioni ? (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
                  <CircularProgress />
                </Box>
              ) : riepilogoDateColumns.length === 0 ? (
                <Alert severity="info">
                  Seleziona almeno una data di distribuzione per generare il
                  riepilogo.
                </Alert>
              ) : (
                <Paper elevation={1} sx={{ p: 3 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Export foglio manuale
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Genera un file XML con estensione <strong>.xls</strong>,
                    pensato per essere aperto in Excel e stampato.
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Sigle precedenti:</strong> D = Duomo, M = Medassino,
                    P = Pombio, S = San Rocco
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Date nel foglio:</strong>{" "}
                    {riepilogoDateColumns.map((item) => item.label).join(", ")}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Righe generate:</strong>{" "}
                    {riepilogoDettaglioMode
                      ? riepilogoDettaglioRows.length
                      : riepilogoRows.length}
                  </Typography>
                </Paper>
              )}
            </Box>
          )}

          {tab === 3 && (
            <Box>
              <Box
                sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}
                className="no-print"
              >
                <Button
                  variant="contained"
                  startIcon={<PrintIcon />}
                  onClick={() => window.print()}
                >
                  Stampa Report
                </Button>
              </Box>

              <Typography
                variant="h6"
                sx={{
                  mb: 2,
                  display: "none",
                  "@media print": { display: "block" },
                }}
              >
                Report FSE+ / FEAD — {new Date().toLocaleDateString("it-IT")}
              </Typography>

              {/* Stat cards */}
              <Grid container spacing={2} sx={{ mb: 4 }}>
                {[
                  {
                    label: "Nuclei attivi",
                    value: nuclei.length,
                    color: "primary.main",
                  },
                  {
                    label: "Componenti totali",
                    value: allComponenti.length,
                    color: "primary.main",
                  },
                  {
                    label: "Con disabilità",
                    value: invalidiCount,
                    color: "warning.main",
                  },
                  {
                    label: "Paesi terzi UE",
                    value: paesiTerziCount,
                    color: "info.main",
                  },
                ].map((s) => (
                  <Grid size={{ xs: 6, sm: 3 }} key={s.label}>
                    <Paper sx={{ p: 2, textAlign: "center" }}>
                      <Typography
                        variant="h4"
                        sx={{ fontWeight: 700, color: s.color }}
                      >
                        {s.value}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {s.label}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              <Grid container spacing={3}>
                {/* Fasce età */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper elevation={1} sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: 600, mb: 2 }}
                    >
                      Fasce di età
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Fascia</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            N° persone
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            %
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {FASCE_ORDINE.map((f) => {
                          const count = fasciaCount[f] ?? 0;
                          const pct =
                            allComponenti.length > 0
                              ? ((count / allComponenti.length) * 100).toFixed(
                                  1,
                                )
                              : "0.0";
                          return (
                            <TableRow key={f}>
                              <TableCell>{FASCIA_LABEL[f]}</TableCell>
                              <TableCell align="right">{count}</TableCell>
                              <TableCell align="right">{pct}%</TableCell>
                            </TableRow>
                          );
                        })}
                        {(fasciaCount["?"] ?? 0) > 0 && (
                          <TableRow>
                            <TableCell sx={{ color: "text.secondary" }}>
                              Non disponibile
                            </TableCell>
                            <TableCell align="right">
                              {fasciaCount["?"]}
                            </TableCell>
                            <TableCell align="right">—</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Paper>
                </Grid>

                {/* Nazionalità */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper elevation={1} sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: 600, mb: 2 }}
                    >
                      Nazionalità (top 5)
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Paese</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            N° persone
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {topNaz.map(([naz, count]) => (
                          <TableRow key={naz}>
                            <TableCell>{naz}</TableCell>
                            <TableCell align="right">{count}</TableCell>
                          </TableRow>
                        ))}
                        {altreNaz > 0 && (
                          <TableRow>
                            <TableCell
                              sx={{
                                fontStyle: "italic",
                                color: "text.secondary",
                              }}
                            >
                              Altre nazionalità
                            </TableCell>
                            <TableCell align="right">{altreNaz}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Paper>
                </Grid>

                {/* Per zona */}
                <Grid size={{ xs: 12 }}>
                  <Paper elevation={1} sx={{ p: 2 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: 600, mb: 2 }}
                    >
                      Distribuzione per zona
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          {[
                            "Zona",
                            "Nuclei",
                            "Componenti",
                            "Disabili",
                            "UE",
                            "Paesi terzi",
                          ].map((h) => (
                            <TableCell
                              key={h}
                              align={h === "Zona" ? "left" : "right"}
                              sx={{ fontWeight: 700 }}
                            >
                              {h}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {ZONE.map((z) => {
                          const nz = nuclei.filter((n) => n.zona === z);
                          const cz = nz.flatMap((n) => n.componenti);
                          return (
                            <TableRow key={z}>
                              <TableCell>{z}</TableCell>
                              <TableCell align="right">{nz.length}</TableCell>
                              <TableCell align="right">{cz.length}</TableCell>
                              <TableCell align="right">
                                {cz.filter((c) => c.invalido).length}
                              </TableCell>
                              <TableCell align="right">
                                {cz.filter((c) => c.extra_ue).length}
                              </TableCell>
                              <TableCell align="right">
                                {cz.filter((c) => c.paesi_terzi_ue).length}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* ═══════════════ TAB 2 — Esporta CSV ═══════════════ */}
          {tab === 4 && (
            <Box>
              <Paper elevation={1} sx={{ p: 3, maxWidth: 600 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Esportazione CSV per FSE+ / Ospo
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 3 }}
                >
                  Genera un file CSV UTF-8 con i dati di tutti i componenti. Una
                  riga per componente, inclusi tutti i campi richiesti per la
                  rendicontazione FSE+.
                </Typography>

                <FormControl size="small" fullWidth sx={{ mb: 3 }}>
                  <InputLabel>Filtra per zona</InputLabel>
                  <Select
                    value={filterZona}
                    label="Filtra per zona"
                    onChange={(e) => setFilterZona(e.target.value)}
                  >
                    <MenuItem value="Tutte">Tutte le zone</MenuItem>
                    {ZONE.map((z) => (
                      <MenuItem key={z} value={z}>
                        {z}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  <strong>Campi inclusi:</strong> CF nucleo · zona · stato · n°
                  tessera · scadenza · nome · cognome · data nascita · fascia
                  età · nazionalità · sesso · invalido · paesi terzi UE · ruolo
                </Typography>

                <Typography variant="body2" sx={{ mb: 3 }}>
                  <strong>Righe da esportare:</strong>{" "}
                  {
                    (filterZona === "Tutte"
                      ? nuclei
                      : nuclei.filter((n) => n.zona === filterZona)
                    ).flatMap((n) => n.componenti).length
                  }{" "}
                  componenti (
                  {filterZona === "Tutte"
                    ? nuclei.length
                    : nuclei.filter((n) => n.zona === filterZona).length}{" "}
                  nuclei)
                </Typography>

                <Button
                  variant="contained"
                  size="large"
                  startIcon={<DownloadIcon />}
                  onClick={esportaCSV}
                  fullWidth
                >
                  Scarica CSV
                </Button>
              </Paper>
            </Box>
          )}
          {/* ═══════════════ TAB 4 — Storico Nucleo ═══════════════ */}
          {tab === 5 && (
            <Box>
              <Box sx={{ mb: 3 }} className="no-print">
                <Autocomplete
                  options={nuclei}
                  getOptionLabel={(n) => {
                    const t = getTitolare(n.componenti);
                    const nome = t
                      ? `${t.cognome} ${t.nome}`
                      : (n.codice_fiscale ?? n.id);
                    const ultima = getUltimaIscrizione(n.iscrizioni);
                    return `${nome}${ultima ? ` — tessera ${ultima.numero_tessera}` : ""} (${n.zona})`;
                  }}
                  value={storicoNucleo}
                  onChange={(_, v) => setStoricoNucleo(v)}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Cerca nucleo (cognome, CF, n° tessera)"
                      size="small"
                      sx={{ maxWidth: 600 }}
                    />
                  )}
                />
              </Box>

              {!storicoNucleo && (
                <Alert severity="info">
                  Seleziona un nucleo per visualizzarne lo storico.
                </Alert>
              )}

              {storicoNucleo && loadingStorico && (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
                  <CircularProgress />
                </Box>
              )}

              {storicoNucleo && !loadingStorico && (
                <Box>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, mb: 2 }}
                  >
                    Storico —{" "}
                    {(() => {
                      const t = getTitolare(storicoNucleo.componenti);
                      return t
                        ? `${t.cognome} ${t.nome}`
                        : storicoNucleo.codice_fiscale;
                    })()}{" "}
                    ({storicoNucleo.zona})
                  </Typography>

                  {storicoEvents.length === 0 ? (
                    <Alert severity="info">
                      Nessun evento registrato per questo nucleo.
                    </Alert>
                  ) : (
                    <TableContainer component={Paper} elevation={1}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: "grey.100" }}>
                            <TableCell sx={{ fontWeight: 700 }}>Data</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tipo</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>
                              Dettaglio
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {storicoEvents.map((ev, i) => (
                            <TableRow
                              key={i}
                              sx={{
                                backgroundColor:
                                  ev.tipo === "iscrizione"
                                    ? "rgba(25,118,210,0.05)"
                                    : "transparent",
                              }}
                            >
                              <TableCell sx={{ whiteSpace: "nowrap" }}>
                                {fmtData(ev.data)}
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={
                                    ev.tipo === "iscrizione"
                                      ? "Iscrizione"
                                      : "Distribuzione"
                                  }
                                  size="small"
                                  color={
                                    ev.tipo === "iscrizione"
                                      ? "primary"
                                      : "success"
                                  }
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell>{ev.descrizione}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              )}
            </Box>
          )}
        </>
      )}

      <Dialog
        open={riepilogoDialogOpen}
        onClose={() => setRiepilogoDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Aggiungi colonna libera</DialogTitle>
        <DialogContent sx={{ pt: 2, display: "grid", gap: 2 }}>
          <TextField
            label="Data"
            type="date"
            value={riepilogoManualDate}
            onChange={(e) => setRiepilogoManualDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel>Luogo</InputLabel>
            <Select
              value={riepilogoManualCenter}
              label="Luogo"
              onChange={(e) =>
                setRiepilogoManualCenter(
                  e.target.value as keyof typeof CENTRO_SIGLA,
                )
              }
            >
              <MenuItem value="Duomo">D - Duomo</MenuItem>
              <MenuItem value="Medassino">M - Medassino</MenuItem>
              <MenuItem value="San Rocco">S - San Rocco</MenuItem>
              <MenuItem value="Pombio">P - Pombio</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRiepilogoDialogOpen(false)}>Annulla</Button>
          <Button
            onClick={aggiungiRiepilogoManuale}
            variant="contained"
            disabled={!riepilogoManualDate}
          >
            Aggiungi
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
