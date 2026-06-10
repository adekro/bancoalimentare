import {
  useState,
  useEffect,
  useCallback,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Stack,
  Card,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  InputAdornment,
  Chip,
  Pagination,
  Menu,
  TableSortLabel,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import ArchiveIcon from "@mui/icons-material/Archive";
import UnarchiveIcon from "@mui/icons-material/Unarchive";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import SearchIcon from "@mui/icons-material/Search";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import BadgeIcon from "@mui/icons-material/Badge";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabase";
import type { StatoNucleo } from "@/components/common/StatusChip";
import {
  parseNucleiFromExcel,
  type ImportNucleo,
} from "@/utils/nucleiExcelImport";

const ZONE_FILTER = ["Tutte", "Pombio", "Duomo", "Medassino", "San Rocco"];
const STATO_FILTER = [
  { value: "", label: "Tutti" },
  { value: "bozza", label: "Bozza" },
  { value: "verde", label: "Attivo" },
  { value: "nero", label: "Non rinnovati" },
  { value: "rosso", label: "Sospesi" },
];
const PAGE_SIZE = 10;

type Componente = {
  id: string;
  ruolo: string;
  nome: string;
  cognome: string;
  codice_fiscale: string | null;
  data_nascita: string | null;
  nazionalita: string | null;
  sesso: "M" | "F" | null;
  paesi_terzi_ue: boolean;
};
type Iscrizione = {
  id: string;
  numero_tessera: string;
  data_scadenza: string | null;
};
type Nucleo = {
  id: string;
  numero_nucleo_familiare: string | null;
  codice_fiscale: string | null;
  telefono: string | null;
  indirizzo: string | null;
  zona: string;
  stato: StatoNucleo;
  archiviato: boolean;
  created_at: string;
  componenti: Componente[];
  iscrizioni: Iscrizione[];
};

type StatoMenuAnchor = {
  nucleoId: string;
  anchorEl: HTMLElement;
};

type ImportOutcome = {
  importati: number;
  saltati: number;
  falliti: number;
  dettagli: string[];
};

type SortDirection = "asc" | "desc";
type ListaUtentiSortKey =
  | "numeroNucleo"
  | "nominativo"
  | "codiceFiscale"
  | "zona"
  | "tessera"
  | "scadenza"
  | "stato";
type ImportPreviewSortKey =
  | "righe"
  | "zona"
  | "capofamiglia"
  | "tesserato"
  | "componenti"
  | "tessera"
  | "codiceFiscale";

function getTesserato(componenti: Componente[]) {
  return (
    componenti.find((c) => c.ruolo === "titolare") ??
    componenti.find((c) => c.ruolo === "capofamiglia") ??
    componenti[0]
  );
}

function getNomePrincipale(componenti: Componente[]) {
  const c = getTesserato(componenti);
  return c ? `${c.cognome} ${c.nome}`.trim() : "—";
}

function getCodiceFiscaleTesserato(nucleo: Nucleo): string | null {
  return getTesserato(nucleo.componenti)?.codice_fiscale ?? null;
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "it", {
    numeric: true,
    sensitivity: "base",
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("it-IT");
}

function getScadenzaTone(value: string | null | undefined) {
  if (!value) return "text.secondary";
  const now = new Date();
  const target = new Date(value);
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "error.main";
  if (diff <= 1000 * 60 * 60 * 24 * 7) return "warning.main";
  return "text.primary";
}

function renderInlineStatus(stato: StatoNucleo) {
  if (stato === "bozza") {
    return { label: "Bozza", color: "#7a5f00" };
  }
  if (stato === "verde") {
    return { label: "Attivo", color: "#1a6e3c" };
  }
  if (stato === "nero") {
    return { label: "Non Rinnovato", color: "#8c4a1e" };
  }
  return { label: "Sospeso", color: "#b3261e" };
}

function birthYear(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return String(date.getFullYear());
}

function calcFascia(
  dataNascita: string | null,
): "0-17" | "18-29" | "30-64" | "65+" | null {
  if (!dataNascita) return null;
  const nascita = new Date(dataNascita);
  if (Number.isNaN(nascita.getTime())) return null;
  const oggi = new Date();
  let anni = oggi.getFullYear() - nascita.getFullYear();
  const m = oggi.getMonth() - nascita.getMonth();
  if (m < 0 || (m === 0 && oggi.getDate() < nascita.getDate())) anni--;
  if (anni < 18) return "0-17";
  if (anni < 30) return "18-29";
  if (anni < 65) return "30-64";
  return "65+";
}

function sortByOlderFirst(a: Componente, b: Componente) {
  const aDate = a.data_nascita
    ? new Date(a.data_nascita).getTime()
    : Number.POSITIVE_INFINITY;
  const bDate = b.data_nascita
    ? new Date(b.data_nascita).getTime()
    : Number.POSITIVE_INFINITY;
  return aDate - bDate;
}

function isCapofamigliaTitolare(componenti: Componente[]) {
  const capo = componenti.find((c) => c.ruolo === "capofamiglia");
  const titolare = componenti.find((c) => c.ruolo === "titolare");
  if (!capo) return false;
  if (!titolare) return true;
  const capoKey =
    `${capo.nome}|${capo.cognome}|${capo.data_nascita ?? ""}`.toLowerCase();
  const titolareKey =
    `${titolare.nome}|${titolare.cognome}|${titolare.data_nascita ?? ""}`.toLowerCase();
  return capo.id === titolare.id || capoKey === titolareKey;
}

function matchSearch(n: Nucleo, q: string) {
  const low = q.toLowerCase();
  if (getCodiceFiscaleTesserato(n)?.toLowerCase().includes(low)) return true;
  if (n.iscrizioni.some((t) => t.numero_tessera.toLowerCase().includes(low)))
    return true;
  if (
    n.componenti.some(
      (c) =>
        c.cognome.toLowerCase().includes(low) ||
        c.nome.toLowerCase().includes(low),
    )
  )
    return true;
  return false;
}

export default function ListaUtenti() {
  const navigate = useNavigate();
  const [nuclei, setNuclei] = useState<Nucleo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zonaFilter, setZonaFilter] = useState("Tutte");
  const [statoFilter, setStatoFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showArchiviati, setShowArchiviati] = useState(false);
  const [archivioId, setArchivioId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [rinnovoOpen, setRinnovoOpen] = useState(false);
  const [rinnovoLoading, setRinnovoLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [page, setPage] = useState(1);
  const [azioniAnchorEl, setAzioniAnchorEl] = useState<HTMLElement | null>(
    null,
  );
  const [statoMenu, setStatoMenu] = useState<StatoMenuAnchor | null>(null);
  const [statoUpdatingId, setStatoUpdatingId] = useState<string | null>(null);
  const [expandedNucleoId, setExpandedNucleoId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importReading, setImportReading] = useState(false);
  const [importNuclei, setImportNuclei] = useState<ImportNucleo[]>([]);
  const [importIssues, setImportIssues] = useState<string[]>([]);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(
    null,
  );
  const [eliminaDatiOpen, setEliminaDatiOpen] = useState(false);
  const [eliminaDatiConfirmText, setEliminaDatiConfirmText] = useState("");
  const [eliminaDatiLoading, setEliminaDatiLoading] = useState(false);
  const [sortBy, setSortBy] = useState<ListaUtentiSortKey>("nominativo");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [importSortBy, setImportSortBy] =
    useState<ImportPreviewSortKey>("righe");
  const [importSortDir, setImportSortDir] = useState<SortDirection>("asc");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: err } = await supabase
      .from("nuclei")
      .select("*, componenti(*), iscrizioni(*)")
      .eq("archiviato", showArchiviati)
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else setNuclei((data as Nucleo[]) ?? []);
    setLoading(false);
  }, [showArchiviati]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSort = (column: ListaUtentiSortKey) => {
    if (sortBy === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(column);
    setSortDir(column === "scadenza" ? "desc" : "asc");
  };

  const handleImportSort = (column: ImportPreviewSortKey) => {
    if (importSortBy === column) {
      setImportSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setImportSortBy(column);
    setImportSortDir(column === "righe" ? "asc" : "asc");
  };

  const filtered = nuclei
    .filter((n) => {
      if (zonaFilter !== "Tutte" && n.zona !== zonaFilter) return false;
      if (statoFilter && n.stato !== statoFilter) return false;
      if (search.trim() && !matchSearch(n, search.trim())) return false;
      return true;
    })
    .sort((a, b) => {
      const latestA = a.iscrizioni
        .slice()
        .sort(
          (first, second) =>
            new Date(second.data_scadenza ?? "").getTime() -
            new Date(first.data_scadenza ?? "").getTime(),
        )[0];
      const latestB = b.iscrizioni
        .slice()
        .sort(
          (first, second) =>
            new Date(second.data_scadenza ?? "").getTime() -
            new Date(first.data_scadenza ?? "").getTime(),
        )[0];

      const valueA = {
        numeroNucleo: a.numero_nucleo_familiare?.trim() || null,
        nominativo: getNomePrincipale(a.componenti),
        codiceFiscale: getCodiceFiscaleTesserato(a),
        zona: a.zona,
        tessera: latestA?.numero_tessera ?? null,
        scadenza: latestA?.data_scadenza ?? null,
        stato: renderInlineStatus(a.stato).label,
      }[sortBy];
      const valueB = {
        numeroNucleo: b.numero_nucleo_familiare?.trim() || null,
        nominativo: getNomePrincipale(b.componenti),
        codiceFiscale: getCodiceFiscaleTesserato(b),
        zona: b.zona,
        tessera: latestB?.numero_tessera ?? null,
        scadenza: latestB?.data_scadenza ?? null,
        stato: renderInlineStatus(b.stato).label,
      }[sortBy];

      const result = compareValues(valueA, valueB);
      if (result !== 0) return sortDir === "asc" ? result : -result;
      return a.id.localeCompare(b.id);
    });

  const sortableHeaders: Array<{ key: ListaUtentiSortKey; label: string }> = [
    { key: "numeroNucleo", label: "N" },
    { key: "nominativo", label: "Nominativo" },
    { key: "codiceFiscale", label: "Codice Fiscale" },
    { key: "zona", label: "Zona" },
    { key: "tessera", label: "N. Tessera" },
    { key: "scadenza", label: "Scadenza" },
    { key: "stato", label: "Stato" },
  ];

  const importSortableHeaders: Array<{
    key: ImportPreviewSortKey;
    label: string;
  }> = [
    { key: "righe", label: "Righe" },
    { key: "zona", label: "Zona" },
    { key: "capofamiglia", label: "Capofamiglia" },
    { key: "tesserato", label: "Tesserato" },
    { key: "componenti", label: "Componenti" },
    { key: "tessera", label: "Tessera" },
    { key: "codiceFiscale", label: "Codice Fiscale" },
  ];

  const sortedImportNuclei = [...importNuclei].sort((a, b) => {
    const capofamigliaA =
      a.persone.find((person) => person.isCapofamiglia) ?? a.persone[0];
    const capofamigliaB =
      b.persone.find((person) => person.isCapofamiglia) ?? b.persone[0];
    const tesseratoA =
      a.persone.find((person) => person.isTesserato) ?? capofamigliaA;
    const tesseratoB =
      b.persone.find((person) => person.isTesserato) ?? capofamigliaB;

    const valueA = {
      righe: a.sourceRowStart,
      zona: a.zona ?? null,
      capofamiglia:
        `${capofamigliaA?.cognome ?? ""} ${capofamigliaA?.nome ?? ""}`.trim() ||
        null,
      tesserato:
        `${tesseratoA?.cognome ?? ""} ${tesseratoA?.nome ?? ""}`.trim() || null,
      componenti: a.persone.length,
      tessera: a.tesseraNumero ?? null,
      codiceFiscale: a.codiceFiscale ?? null,
    }[importSortBy];
    const valueB = {
      righe: b.sourceRowStart,
      zona: b.zona ?? null,
      capofamiglia:
        `${capofamigliaB?.cognome ?? ""} ${capofamigliaB?.nome ?? ""}`.trim() ||
        null,
      tesserato:
        `${tesseratoB?.cognome ?? ""} ${tesseratoB?.nome ?? ""}`.trim() || null,
      componenti: b.persone.length,
      tessera: b.tesseraNumero ?? null,
      codiceFiscale: b.codiceFiscale ?? null,
    }[importSortBy];

    const result = compareValues(valueA, valueB);
    if (result !== 0) return importSortDir === "asc" ? result : -result;
    return a.sourceRowStart - b.sourceRowStart;
  });

  useEffect(() => {
    setPage(1);
  }, [search, zonaFilter, statoFilter, showArchiviati]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const totaleFamiglie = nuclei.length;
  const attiviCount = nuclei.filter((n) => n.stato === "verde").length;
  const inScadenzaCount = nuclei.filter((n) => {
    const latestIscr = n.iscrizioni
      .slice()
      .sort(
        (a, b) =>
          new Date(b.data_scadenza ?? "").getTime() -
          new Date(a.data_scadenza ?? "").getTime(),
      )[0];
    const date = latestIscr?.data_scadenza;
    if (!date) return false;
    const diff = new Date(date).getTime() - Date.now();
    return diff > 0 && diff <= 1000 * 60 * 60 * 48;
  }).length;
  const zoneAttiveCount = new Set(nuclei.map((n) => n.zona)).size;

  const handleArchivia = async () => {
    if (!archivioId) return;
    setArchiving(true);
    await supabase
      .from("nuclei")
      .update({ archiviato: !showArchiviati })
      .eq("id", archivioId);
    setArchiving(false);
    setArchivioId(null);
    load();
  };

  const handleRinnovoAnnuale = async () => {
    setRinnovoLoading(true);
    const { error: err } = await supabase
      .from("nuclei")
      .update({ stato: "verde" })
      .eq("archiviato", false);
    setRinnovoLoading(false);
    setRinnovoOpen(false);
    if (err) setError(err.message);
    else {
      setSuccessMsg(
        'Rinnovo annuale completato: tutti i nuclei attivi sono stati reimpostati su "Attivo".',
      );
      load();
    }
  };

  const openStatoMenu = (event: MouseEvent<HTMLElement>, nucleoId: string) => {
    setStatoMenu({ nucleoId, anchorEl: event.currentTarget });
  };

  const closeStatoMenu = () => {
    setStatoMenu(null);
  };

  const handleStatoChange = async (nuovoStato: StatoNucleo) => {
    if (!statoMenu) return;
    const id = statoMenu.nucleoId;
    closeStatoMenu();
    setStatoUpdatingId(id);
    const { error: err } = await supabase
      .from("nuclei")
      .update({ stato: nuovoStato })
      .eq("id", id);
    setStatoUpdatingId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccessMsg("Stato nucleo aggiornato con successo.");
    load();
  };

  const toggleExpandNucleo = (id: string) => {
    setExpandedNucleoId((current) => (current === id ? null : id));
  };

  const openAzioniMenu = (event: MouseEvent<HTMLElement>) => {
    setAzioniAnchorEl(event.currentTarget);
  };

  const closeAzioniMenu = () => {
    setAzioniAnchorEl(null);
  };

  const handleAzioneCopiaIncolla = () => {
    closeAzioniMenu();
    setSuccessMsg(
      "La funzione di import rapido e disponibile nella pagina di dettaglio nucleo.",
    );
  };

  const resetImportState = () => {
    setImportFileName("");
    setImportNuclei([]);
    setImportIssues([]);
    setImportOutcome(null);
  };

  const handleAzioneImportaExcel = () => {
    closeAzioniMenu();
    setImportOpen(true);
    resetImportState();
  };

  const handleImportFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Formato non supportato: seleziona un file .xlsx");
      return;
    }

    setImportReading(true);
    setImportOutcome(null);
    setError("");

    try {
      const parsed = await parseNucleiFromExcel(file);
      setImportFileName(file.name);
      setImportNuclei(parsed.nuclei);
      setImportIssues(
        parsed.issues.map((issue) => `Riga ${issue.row}: ${issue.message}`),
      );
      if (parsed.nuclei.length === 0) {
        setError("Nessun nucleo riconosciuto nel file selezionato.");
      }
    } catch (e) {
      setImportFileName(file.name);
      setImportNuclei([]);
      setImportIssues([]);
      setError(
        e instanceof Error
          ? e.message
          : "Errore durante la lettura del file Excel.",
      );
    } finally {
      setImportReading(false);
    }
  };

  const validImportNuclei = importNuclei.filter(
    (n) => n.validationErrors.length === 0,
  );

  const handleConfermaImport = async () => {
    if (validImportNuclei.length === 0) {
      setError("Non ci sono nuclei validi da importare.");
      return;
    }

    setImportSubmitting(true);
    setError("");

    const dettagli: string[] = [];
    let importati = 0;
    let saltati = 0;
    let falliti = 0;

    const cfValues = Array.from(
      new Set(
        validImportNuclei
          .map((n) => n.codiceFiscale?.toUpperCase().trim() ?? "")
          .filter(Boolean),
      ),
    );
    const tessValues = Array.from(
      new Set(
        validImportNuclei
          .map((n) => n.tesseraNumero?.trim() ?? "")
          .filter(Boolean),
      ),
    );

    const existingCf = new Set<string>();
    const existingTessere = new Set<string>();

    if (cfValues.length > 0) {
      const { data } = await supabase
        .from("componenti")
        .select("codice_fiscale")
        .in("codice_fiscale", cfValues);
      data?.forEach((row) => {
        if (row.codice_fiscale)
          existingCf.add(String(row.codice_fiscale).toUpperCase().trim());
      });
    }

    if (tessValues.length > 0) {
      const { data } = await supabase
        .from("iscrizioni")
        .select("numero_tessera")
        .in("numero_tessera", tessValues);
      data?.forEach((row) => {
        if (row.numero_tessera)
          existingTessere.add(String(row.numero_tessera).trim());
      });
    }

    const seenCfInFile = new Set<string>();
    const seenTessInFile = new Set<string>();

    for (const nucleo of validImportNuclei) {
      const capofamiglia =
        nucleo.persone.find((p) => p.isCapofamiglia) ?? nucleo.persone[0];
      if (!nucleo.zona) {
        saltati++;
        dettagli.push(
          `Saltato blocco riga ${nucleo.sourceRowStart}: zona non riconosciuta.`,
        );
        continue;
      }
      const cf = nucleo.codiceFiscale?.toUpperCase().trim() ?? "";
      const tessera = nucleo.tesseraNumero?.trim() ?? "";

      if (cf && (existingCf.has(cf) || seenCfInFile.has(cf))) {
        saltati++;
        dettagli.push(
          `Saltato blocco riga ${nucleo.sourceRowStart}: codice fiscale gia presente (${cf}).`,
        );
        continue;
      }

      if (
        tessera &&
        (existingTessere.has(tessera) || seenTessInFile.has(tessera))
      ) {
        saltati++;
        dettagli.push(
          `Saltato blocco riga ${nucleo.sourceRowStart}: tessera gia presente (${tessera}).`,
        );
        continue;
      }

      const { data: createdNucleo, error: nucleoErr } = await supabase
        .from("nuclei")
        .insert({
          numero_nucleo_familiare: nucleo.numeroNucleoFamiliare,
          telefono: nucleo.telefono,
          indirizzo: nucleo.indirizzo,
          zona: nucleo.zona,
          stato: "verde",
          archiviato: false,
        })
        .select("id")
        .single();

      if (nucleoErr || !createdNucleo) {
        falliti++;
        dettagli.push(
          `Errore blocco riga ${nucleo.sourceRowStart}: ${nucleoErr?.message ?? "creazione nucleo fallita."}`,
        );
        continue;
      }

      const componentiToInsert = nucleo.persone
        .filter((p) => p.cognome || p.nome)
        .map((p) => ({
          nucleo_id: createdNucleo.id,
          ruolo: p.isCapofamiglia
            ? "capofamiglia"
            : p.isTesserato
              ? "titolare"
              : "componente",
          nome: p.nome,
          cognome: p.cognome,
          codice_fiscale: p.isTesserato ? cf || null : null,
          data_nascita: p.dataNascita,
          nazione_nascita: p.nazioneNascita,
          nazionalita: p.nazionalita,
          sesso: p.sesso,
          paesi_terzi_ue: p.paesiTerziUe,
          invalido: p.invalido,
          fascia_eta: calcFascia(p.dataNascita),
        }));

      const { error: compErr } = await supabase
        .from("componenti")
        .insert(componentiToInsert);

      if (compErr) {
        falliti++;
        dettagli.push(
          `Errore componenti riga ${nucleo.sourceRowStart}: ${compErr.message}`,
        );
        continue;
      }

      if (tessera) {
        const { error: iscrErr } = await supabase.from("iscrizioni").insert({
          nucleo_id: createdNucleo.id,
          numero_tessera: tessera,
          data_scadenza: nucleo.tesseraScadenza,
        });

        if (iscrErr) {
          dettagli.push(
            `Nucleo ${capofamiglia.cognome} ${capofamiglia.nome} importato senza tessera: ${iscrErr.message}`.trim(),
          );
        }
      }

      importati++;
      if (cf) {
        existingCf.add(cf);
        seenCfInFile.add(cf);
      }
      if (tessera) {
        existingTessere.add(tessera);
        seenTessInFile.add(tessera);
      }
    }

    setImportSubmitting(false);
    setImportOutcome({ importati, saltati, falliti, dettagli });

    if (importati > 0) {
      setSuccessMsg(
        `Import completato: ${importati} nuclei importati, ${saltati} saltati, ${falliti} falliti.`,
      );
      load();
    } else {
      setError(
        `Import non completato: ${saltati} nuclei saltati, ${falliti} falliti.`,
      );
    }
  };

  const handleAzioneRinnovo = () => {
    closeAzioniMenu();
    setRinnovoOpen(true);
  };

  const handleAzioneEliminaDati = () => {
    closeAzioniMenu();
    setEliminaDatiConfirmText("");
    setEliminaDatiOpen(true);
  };

  const handleEliminaDati = async () => {
    if (eliminaDatiConfirmText.trim().toLowerCase() !== "elimina") {
      setError(
        'Per confermare la cancellazione inserisci esattamente "elimina".',
      );
      return;
    }

    setEliminaDatiLoading(true);
    setError("");

    // Prima elimina distribuzioni (FK RESTRICT), poi nuclei. Tessere e componenti sono in CASCADE.
    const { error: distErr } = await supabase
      .from("distribuzioni")
      .delete()
      .not("id", "is", null);

    if (distErr) {
      setEliminaDatiLoading(false);
      setError(`Errore eliminazione distribuzioni: ${distErr.message}`);
      return;
    }

    const { error: nucleiErr } = await supabase
      .from("nuclei")
      .delete()
      .not("id", "is", null);

    setEliminaDatiLoading(false);

    if (nucleiErr) {
      setError(`Errore eliminazione nuclei: ${nucleiErr.message}`);
      return;
    }

    setEliminaDatiOpen(false);
    setEliminaDatiConfirmText("");
    setSuccessMsg(
      "Tutti i nuclei e i dati relazionati sono stati eliminati dal database.",
    );
    load();
  };

  const statoMenuCurrent = statoMenu
    ? (nuclei.find((n) => n.id === statoMenu.nucleoId)?.stato ?? null)
    : null;

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr auto" },
          alignItems: { xs: "start", md: "center" },
          columnGap: 2,
          rowGap: 1.2,
          mb: 4.2,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: { xs: "2rem", md: "2.15rem" },
              fontWeight: 800,
              lineHeight: 1.1,
            }}
          >
            Nuclei Familiari
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: "0.98rem", md: "1.02rem" },
              color: "text.secondary",
              mt: 0.4,
            }}
          >
            Gestione anagrafica e monitoraggio beneficiari
          </Typography>
        </Box>
        <Stack
          direction="row"
          sx={{
            gap: 0.8,
            flexWrap: { xs: "wrap", md: "nowrap" },
            justifyContent: { xs: "flex-start", md: "flex-end" },
            justifySelf: { md: "end" },
            mt: { xs: 0.2, md: 0.4 },
          }}
        >
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate("/utenti/nuovo")}
            sx={{
              minHeight: 34,
              px: 1.3,
              fontSize: "0.9rem",
              m: 0.25,
              bgcolor: "#0c6a3a",
              "&:hover": { bgcolor: "#09582f" },
            }}
          >
            Nuovo Nucleo
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={openAzioniMenu}
            endIcon={
              azioniAnchorEl ? (
                <KeyboardArrowUpIcon />
              ) : (
                <KeyboardArrowDownIcon />
              )
            }
            sx={{ minHeight: 34, px: 1.3, fontSize: "0.9rem", m: 0.25 }}
          >
            Azioni
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(4, minmax(0, 1fr))" },
          gap: 2,
          mb: 3.4,
        }}
      >
        <Card variant="outlined" sx={{ p: 2.4, minHeight: 132 }}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", mb: 1.3 }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ letterSpacing: 0.7, fontWeight: 700 }}
            >
              TOTALE FAMIGLIE
            </Typography>
            <GroupOutlinedIcon fontSize="small" color="success" />
          </Stack>
          <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            {totaleFamiglie.toLocaleString("it-IT")}
          </Typography>
          <Typography
            variant="caption"
            color="success.main"
            sx={{ fontWeight: 700 }}
          >
            +12%
          </Typography>
        </Card>
        <Card variant="outlined" sx={{ p: 2.4, minHeight: 132 }}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", mb: 1.3 }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ letterSpacing: 0.7, fontWeight: 700 }}
            >
              ATTIVI
            </Typography>
            <CheckCircleOutlineOutlinedIcon fontSize="small" color="success" />
          </Stack>
          <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            {attiviCount.toLocaleString("it-IT")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Verifica mensile completata
          </Typography>
        </Card>
        <Card variant="outlined" sx={{ p: 2.4, minHeight: 132 }}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", mb: 1.3 }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ letterSpacing: 0.7, fontWeight: 700 }}
            >
              IN SCADENZA (48H)
            </Typography>
            <WarningAmberOutlinedIcon fontSize="small" color="warning" />
          </Stack>
          <Typography
            variant="h4"
            color="#8c4a1e"
            sx={{ fontWeight: 700, lineHeight: 1.1 }}
          >
            {inScadenzaCount.toLocaleString("it-IT")}
          </Typography>
          <Typography
            variant="caption"
            color="warning.main"
            sx={{ fontWeight: 700 }}
          >
            Richiede Rinnovo
          </Typography>
        </Card>
        <Card variant="outlined" sx={{ p: 2.4, minHeight: 132 }}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", mb: 1.3 }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ letterSpacing: 0.7, fontWeight: 700 }}
            >
              ZONIZZAZIONE
            </Typography>
            <MapOutlinedIcon fontSize="small" color="disabled" />
          </Stack>
          <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            {zoneAttiveCount.toLocaleString("it-IT")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Aree urbane attive
          </Typography>
        </Card>
      </Box>

      {/* Filtri */}
      <Paper variant="outlined" sx={{ p: 2.4, mb: 3.2 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{
            alignItems: { xs: "stretch", md: "center" },
            justifyContent: "space-between",
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.2}
            sx={{ alignItems: { xs: "stretch", sm: "center" } }}
          >
            <TextField
              placeholder="Cerca nome, CF, tessera..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              sx={{ minWidth: 250 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              select
              size="small"
              label="Filtra per zona"
              value={zonaFilter}
              onChange={(e) => setZonaFilter(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              {ZONE_FILTER.map((z) => (
                <MenuItem key={z} value={z}>
                  {z}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              {STATO_FILTER.map((item) => (
                <Chip
                  key={item.value || "all"}
                  label={item.label}
                  onClick={() => setStatoFilter(item.value)}
                  color={statoFilter === item.value ? "success" : "default"}
                  variant={statoFilter === item.value ? "filled" : "outlined"}
                  size="small"
                />
              ))}
            </Stack>
          </Stack>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <Button
              variant={showArchiviati ? "outlined" : "text"}
              color="inherit"
              onClick={() => setShowArchiviati((v) => !v)}
            >
              {showArchiviati ? "Mostra Attivi" : "Mostra Archiviati"}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setSuccessMsg("")}
        >
          {successMsg}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ borderRadius: 3, mt: 0.4 }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: "grey.50" }}>
                {sortableHeaders.map((header) => (
                  <TableCell
                    key={header.key}
                    sortDirection={sortBy === header.key ? sortDir : false}
                  >
                    <TableSortLabel
                      active={sortBy === header.key}
                      direction={sortBy === header.key ? sortDir : "asc"}
                      onClick={() => handleSort(header.key)}
                    >
                      <Box
                        component="span"
                        sx={{
                          fontWeight: 700,
                          color: "text.secondary",
                          fontSize: "0.75rem",
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        {header.label}
                      </Box>
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell
                  sx={{
                    fontWeight: 700,
                    color: "text.secondary",
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Azioni
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    align="center"
                    sx={{ py: 5, color: "text.secondary" }}
                  >
                    Nessun nucleo trovato
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((n) => {
                  const nome = getNomePrincipale(n.componenti);
                  const latestIscr = n.iscrizioni
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(b.data_scadenza ?? "").getTime() -
                        new Date(a.data_scadenza ?? "").getTime(),
                    )[0];
                  const scadenza = latestIscr?.data_scadenza ?? null;
                  const status = renderInlineStatus(n.stato);
                  const componentiOrdinati = [...n.componenti].sort(
                    sortByOlderFirst,
                  );
                  const capoCoincideConTitolare = isCapofamigliaTitolare(
                    n.componenti,
                  );
                  const isExpanded = expandedNucleoId === n.id;
                  const isUpdating = statoUpdatingId === n.id;
                  return (
                    <TableRow key={n.id} hover>
                      <TableCell sx={{ width: 72 }}>
                        <Box
                          sx={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            bgcolor: "rgba(26, 110, 60, 0.12)",
                            color: "primary.main",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {n.numero_nucleo_familiare?.trim() || "nd"}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                            {nome}
                          </Typography>
                          <Stack
                            direction="row"
                            spacing={0.7}
                            sx={{ alignItems: "center" }}
                          >
                            <Tooltip
                              title={
                                capoCoincideConTitolare
                                  ? "Capofamiglia coincidente con titolare tessera"
                                  : "Capofamiglia diverso da titolare tessera"
                              }
                            >
                              {capoCoincideConTitolare ? (
                                <BadgeIcon
                                  sx={{ fontSize: 16, color: "success.main" }}
                                />
                              ) : (
                                <BadgeOutlinedIcon
                                  sx={{ fontSize: 16, color: "warning.main" }}
                                />
                              )}
                            </Tooltip>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {capoCoincideConTitolare
                                ? "Capofamiglia = Titolare"
                                : "Capofamiglia distinto dal titolare"}
                            </Typography>
                          </Stack>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            onClick={() => toggleExpandNucleo(n.id)}
                            sx={{
                              cursor: "pointer",
                              textDecoration: "underline dotted",
                            }}
                          >
                            Nucleo: {Math.max(n.componenti.length, 1)} persone
                          </Typography>
                          {isExpanded && (
                            <Stack spacing={0.45} sx={{ mt: 0.8 }}>
                              {componentiOrdinati.length === 0 ? (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Nessun componente disponibile
                                </Typography>
                              ) : (
                                componentiOrdinati.map((c) => (
                                  <Stack
                                    key={c.id}
                                    direction="row"
                                    spacing={0.5}
                                    sx={{ alignItems: "center" }}
                                  >
                                    {c.ruolo === "capofamiglia" && (
                                      <Tooltip title="Capofamiglia">
                                        <CreditCardOutlinedIcon
                                          sx={{
                                            fontSize: 14,
                                            color: "primary.main",
                                          }}
                                        />
                                      </Tooltip>
                                    )}
                                    {(c.ruolo === "titolare" ||
                                      (c.ruolo === "capofamiglia" &&
                                        !n.componenti.some(
                                          (p) => p.ruolo === "titolare",
                                        ))) && (
                                      <Tooltip title="Titolare tessera">
                                        <HomeOutlinedIcon
                                          sx={{
                                            fontSize: 14,
                                            color: "success.dark",
                                          }}
                                        />
                                      </Tooltip>
                                    )}
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{ lineHeight: 1.3 }}
                                    >
                                      {`${c.nome} ${c.cognome}`.trim()} -{" "}
                                      {birthYear(c.data_nascita)} -{" "}
                                      {c.nazionalita || "—"}
                                    </Typography>
                                  </Stack>
                                ))
                              )}
                            </Stack>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {getCodiceFiscaleTesserato(n) ?? "—"}
                      </TableCell>
                      <TableCell>{n.zona}</TableCell>
                      <TableCell>{latestIscr?.numero_tessera ?? "—"}</TableCell>
                      <TableCell
                        sx={{
                          color: getScadenzaTone(scadenza),
                          fontWeight: 700,
                        }}
                      >
                        {formatDate(scadenza)}
                      </TableCell>
                      <TableCell>
                        <Stack
                          direction="row"
                          spacing={0.8}
                          onClick={(event) =>
                            !isUpdating && openStatoMenu(event, n.id)
                          }
                          sx={{
                            alignItems: "center",
                            cursor: isUpdating ? "default" : "pointer",
                            opacity: isUpdating ? 0.7 : 1,
                          }}
                        >
                          <Box
                            sx={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              bgcolor: status.color,
                            }}
                          />
                          {isUpdating ? (
                            <CircularProgress size={14} />
                          ) : (
                            <Typography
                              variant="body2"
                              sx={{ color: status.color, fontWeight: 700 }}
                            >
                              {status.label}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" sx={{ gap: 0.5 }}>
                          <Tooltip title="Modifica">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => navigate(`/utenti/${n.id}`)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip
                            title={showArchiviati ? "Ripristina" : "Archivia"}
                          >
                            <IconButton
                              size="small"
                              onClick={() => setArchivioId(n.id)}
                            >
                              {showArchiviati ? (
                                <UnarchiveIcon fontSize="small" />
                              ) : (
                                <ArchiveIcon fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 2,
              py: 1.3,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ letterSpacing: 0.7 }}
            >
              VISUALIZZANDO {filtered.length === 0 ? 0 : pageStart + 1}-
              {Math.min(pageStart + PAGE_SIZE, filtered.length)} DI{" "}
              {filtered.length.toLocaleString("it-IT")} RISULTATI
            </Typography>
            <Pagination
              count={pageCount}
              page={safePage}
              onChange={(_, value) => setPage(value)}
              size="small"
              shape="rounded"
              color="primary"
            />
          </Box>
        </TableContainer>
      )}

      <Menu
        anchorEl={azioniAnchorEl}
        open={!!azioniAnchorEl}
        onClose={closeAzioniMenu}
      >
        <MenuItem onClick={handleAzioneCopiaIncolla}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <ContentPasteIcon fontSize="small" />
            <Typography variant="body2">Copia-incolla da Excel</Typography>
          </Stack>
        </MenuItem>
        <MenuItem onClick={handleAzioneImportaExcel}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <UploadFileIcon fontSize="small" />
            <Typography variant="body2">Importa da file Excel</Typography>
          </Stack>
        </MenuItem>
        <MenuItem onClick={handleAzioneRinnovo}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <AutorenewIcon fontSize="small" />
            <Typography variant="body2">Rinnovo Annuale</Typography>
          </Stack>
        </MenuItem>
        <MenuItem onClick={handleAzioneEliminaDati}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <DeleteForeverIcon fontSize="small" color="error" />
            <Typography variant="body2" color="error">
              Elimina dati
            </Typography>
          </Stack>
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={statoMenu?.anchorEl ?? null}
        open={!!statoMenu}
        onClose={closeStatoMenu}
      >
        {STATO_FILTER.filter((item) => item.value).map((item) => (
          <MenuItem
            key={item.value}
            selected={statoMenuCurrent === item.value}
            onClick={() => handleStatoChange(item.value as StatoNucleo)}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>

      {/* Dialog archivia/ripristina */}

      <Dialog open={!!archivioId} onClose={() => setArchivioId(null)}>
        <DialogTitle>
          {showArchiviati ? "Ripristina nucleo" : "Archivia nucleo"}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {showArchiviati
              ? "Vuoi ripristinare questo nucleo tra quelli attivi?"
              : "Vuoi archiviare questo nucleo? Non comparirà più nelle liste attive."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchivioId(null)}>Annulla</Button>
          <Button
            variant="contained"
            color={showArchiviati ? "primary" : "error"}
            onClick={handleArchivia}
            disabled={archiving}
          >
            {archiving ? (
              <CircularProgress size={20} color="inherit" />
            ) : showArchiviati ? (
              "Ripristina"
            ) : (
              "Archivia"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog rinnovo annuale */}
      <Dialog open={rinnovoOpen} onClose={() => setRinnovoOpen(false)}>
        <DialogTitle>Rinnovo Massivo Annuale</DialogTitle>
        <DialogContent>
          <Typography>
            Questa operazione reimposta lo stato di{" "}
            <strong>tutti i nuclei attivi</strong> su <strong>"Attivo"</strong>{" "}
            (verde). Solitamente viene eseguita il 1° gennaio.
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
            I nuclei archiviati non verranno modificati.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRinnovoOpen(false)}>Annulla</Button>
          <Button
            variant="contained"
            onClick={handleRinnovoAnnuale}
            disabled={rinnovoLoading}
          >
            {rinnovoLoading ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Conferma rinnovo"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog eliminazione completa dati nuclei */}
      <Dialog
        open={eliminaDatiOpen}
        onClose={() => !eliminaDatiLoading && setEliminaDatiOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error">Elimina tutti i dati nuclei</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            Operazione irreversibile: verranno eliminati tutti i nuclei
            familiari e tutti i dati relazionati (componenti, tessere,
            distribuzioni).
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.2 }}>
            Per confermare, scrivi <strong>elimina</strong> nel campo qui sotto.
          </Typography>
          <TextField
            fullWidth
            label="Conferma eliminazione"
            placeholder="elimina"
            value={eliminaDatiConfirmText}
            onChange={(e) => setEliminaDatiConfirmText(e.target.value)}
            disabled={eliminaDatiLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEliminaDatiOpen(false)}
            disabled={eliminaDatiLoading}
          >
            Annulla
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleEliminaDati}
            disabled={
              eliminaDatiLoading ||
              eliminaDatiConfirmText.trim().toLowerCase() !== "elimina"
            }
          >
            {eliminaDatiLoading ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Elimina definitivamente"
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog import da file Excel */}
      <Dialog
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          resetImportState();
        }}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Importa nuclei da file Excel (.xlsx)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.2 }}>
            Regola attiva: ogni nucleo viene letto come blocco a partire dalla
            riga capofila (es. NR/TESS valorizzati) e include i componenti nelle
            righe successive.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Mappatura zona da colonna GR: S = San Rocco, D = Duomo, P = Pombio,
            M = Medassino. Duplicati su codice fiscale o tessera vengono saltati
            con report finale.
          </Typography>

          <Stack
            direction={{ xs: "column", md: "row" }}
            sx={{
              gap: 1.5,
              alignItems: { xs: "stretch", md: "center" },
              mb: 2,
            }}
          >
            <Button
              component="label"
              variant="outlined"
              startIcon={<UploadFileIcon />}
              disabled={importReading || importSubmitting}
            >
              Seleziona file Excel
              <input
                hidden
                type="file"
                accept=".xlsx"
                onChange={handleImportFileChange}
              />
            </Button>
            <Typography variant="body2" color="text.secondary">
              {importFileName || "Nessun file selezionato"}
            </Typography>
            {importReading && <CircularProgress size={20} />}
          </Stack>

          {importNuclei.length > 0 && (
            <>
              <Stack
                direction={{ xs: "column", md: "row" }}
                sx={{ gap: 1.2, mb: 1.5 }}
              >
                <Chip
                  label={`Nuclei rilevati: ${importNuclei.length}`}
                  color="default"
                  variant="outlined"
                />
                <Chip
                  label={`Nuclei validi: ${validImportNuclei.length}`}
                  color="success"
                  variant="outlined"
                />
                <Chip
                  label={`Errori/parsing: ${importIssues.length}`}
                  color={importIssues.length > 0 ? "warning" : "default"}
                  variant="outlined"
                />
              </Stack>

              <TableContainer
                component={Paper}
                variant="outlined"
                sx={{ mb: 2, maxHeight: 320 }}
              >
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {importSortableHeaders.map((header) => (
                        <TableCell
                          key={header.key}
                          sortDirection={
                            importSortBy === header.key ? importSortDir : false
                          }
                        >
                          <TableSortLabel
                            active={importSortBy === header.key}
                            direction={
                              importSortBy === header.key
                                ? importSortDir
                                : "asc"
                            }
                            onClick={() => handleImportSort(header.key)}
                          >
                            <Box component="span" sx={{ fontWeight: 700 }}>
                              {header.label}
                            </Box>
                          </TableSortLabel>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedImportNuclei.slice(0, 50).map((n) => {
                      const capofamiglia =
                        n.persone.find((p) => p.isCapofamiglia) ?? n.persone[0];
                      const tesserato =
                        n.persone.find((p) => p.isTesserato) ?? capofamiglia;

                      return (
                        <TableRow key={`${n.sourceRowStart}-${n.sourceRowEnd}`}>
                          <TableCell>{`${n.sourceRowStart}-${n.sourceRowEnd}`}</TableCell>
                          <TableCell>{n.zona ?? "—"}</TableCell>
                          <TableCell>
                            {`${capofamiglia?.cognome ?? ""} ${capofamiglia?.nome ?? ""}`.trim() ||
                              "—"}
                          </TableCell>
                          <TableCell>
                            {`${tesserato?.cognome ?? ""} ${tesserato?.nome ?? ""}`.trim() ||
                              "—"}
                          </TableCell>
                          <TableCell>{n.persone.length}</TableCell>
                          <TableCell>{n.tesseraNumero ?? "—"}</TableCell>
                          <TableCell>{n.codiceFiscale ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {importIssues.length > 0 && (
            <Paper
              variant="outlined"
              sx={{
                p: 1.2,
                maxHeight: 180,
                overflow: "auto",
                bgcolor: "warning.50",
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Avvisi di validazione
              </Typography>
              {importIssues.slice(0, 80).map((issue, idx) => (
                <Typography
                  key={`${issue}-${idx}`}
                  variant="caption"
                  sx={{ display: "block" }}
                >
                  - {issue}
                </Typography>
              ))}
            </Paper>
          )}

          {importOutcome && (
            <Alert
              severity={importOutcome.importati > 0 ? "success" : "warning"}
              sx={{ mt: 2 }}
            >
              Import completato: {importOutcome.importati} importati,{" "}
              {importOutcome.saltati} saltati, {importOutcome.falliti} falliti.
              {importOutcome.dettagli.length > 0 && (
                <Box sx={{ mt: 0.7 }}>
                  {importOutcome.dettagli.slice(0, 60).map((d, i) => (
                    <Typography
                      key={`${d}-${i}`}
                      variant="caption"
                      sx={{ display: "block" }}
                    >
                      - {d}
                    </Typography>
                  ))}
                </Box>
              )}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setImportOpen(false);
              resetImportState();
            }}
            disabled={importSubmitting}
          >
            Chiudi
          </Button>
          <Button
            variant="contained"
            onClick={handleConfermaImport}
            disabled={
              importReading ||
              importSubmitting ||
              validImportNuclei.length === 0
            }
          >
            {importSubmitting ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Importa nuclei validi"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
