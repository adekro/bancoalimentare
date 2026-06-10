import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Paper,
  Stack,
  Alert,
  CircularProgress,
  Divider,
  Switch,
  FormControlLabel,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import TableRowsIcon from "@mui/icons-material/TableRows";
import HistoryIcon from "@mui/icons-material/History";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import Groups2OutlinedIcon from "@mui/icons-material/Groups2Outlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/api/supabase";
import StatusChip from "@/components/common/StatusChip";
import type { StatoNucleo } from "@/components/common/StatusChip";
import NationalityAutocomplete from "@/components/common/NationalityAutocomplete";
import StoricoDistribuzioniDialog from "@/components/common/StoricoDistribuzioniDialog";
import { parsePastedPersoneFromExcel } from "../../utils/personaExcelPaste";

const ZONE = ["Pombio", "Duomo", "Medassino", "San Rocco"];
const STATI: { value: StatoNucleo; label: string }[] = [
  { value: "bozza", label: "Bozza" },
  { value: "verde", label: "Attivo" },
  { value: "nero", label: "Non rinnovato" },
  { value: "rosso", label: "Sospeso" },
];

type PersonaForm = {
  nome: string;
  cognome: string;
  data_nascita: string;
  nazione_nascita: string;
  nazionalita: string;
  sesso: "M" | "F" | "";
  paesi_terzi_ue: boolean;
  invalido: boolean;
};
const PERSONA_VUOTA: PersonaForm = {
  nome: "",
  cognome: "",
  data_nascita: "",
  nazione_nascita: "",
  nazionalita: "",
  sesso: "",
  paesi_terzi_ue: false,
  invalido: false,
};

type SortDirection = "asc" | "desc";
type StoricoIscrizioniSortKey =
  | "numeroTessera"
  | "dataInizio"
  | "scadenza"
  | "note"
  | "registrataIl";

function calcFascia(
  dataNascita: string,
): "0-17" | "18-29" | "30-64" | "65+" | null {
  if (!dataNascita) return null;
  const nascita = new Date(dataNascita);
  const oggi = new Date();
  let anni = oggi.getFullYear() - nascita.getFullYear();
  const m = oggi.getMonth() - nascita.getMonth();
  if (m < 0 || (m === 0 && oggi.getDate() < nascita.getDate())) anni--;
  if (anni < 18) return "0-17";
  if (anni < 30) return "18-29";
  if (anni < 65) return "30-64";
  return "65+";
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

function getYearFromIsoDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

// ---- Sub-componente form persona ----
function SezionePersona({
  value,
  onChange,
  label,
}: {
  value: PersonaForm;
  onChange: (v: PersonaForm) => void;
  label: string;
}) {
  return (
    <Box>
      {label && (
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
          {label}
        </Typography>
      )}
      <Stack direction="row" sx={{ gap: 2.5, flexWrap: "wrap" }}>
        <TextField
          label="Cognome"
          value={value.cognome}
          required
          onChange={(e) => onChange({ ...value, cognome: e.target.value })}
          sx={{ flex: 1, minWidth: 160 }}
        />
        <TextField
          label="Nome"
          value={value.nome}
          required
          onChange={(e) => onChange({ ...value, nome: e.target.value })}
          sx={{ flex: 1, minWidth: 160 }}
        />
        <TextField
          label="Data di nascita"
          type="date"
          value={value.data_nascita}
          onChange={(e) => onChange({ ...value, data_nascita: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ flex: 1, minWidth: 160 }}
        />
        <NationalityAutocomplete
          value={value.nazione_nascita}
          onChange={(newValue) =>
            onChange({ ...value, nazione_nascita: newValue })
          }
          label="Nazione di nascita"
          sx={{ flex: 1, minWidth: 160 }}
        />
        <NationalityAutocomplete
          value={value.nazionalita}
          onChange={(newValue) => onChange({ ...value, nazionalita: newValue })}
          label="Nazionalità"
          sx={{ flex: 1, minWidth: 160 }}
        />
        <TextField
          select
          label="Sesso"
          value={value.sesso}
          onChange={(e) =>
            onChange({
              ...value,
              sesso: e.target.value as PersonaForm["sesso"],
            })
          }
          sx={{ width: { xs: "100%", md: 180 } }}
        >
          <MenuItem value="">Non specificato</MenuItem>
          <MenuItem value="M">Maschio</MenuItem>
          <MenuItem value="F">Femmina</MenuItem>
        </TextField>
      </Stack>
      <Stack direction="row" sx={{ gap: 1 }}>
        <FormControlLabel
          control={
            <Switch
              checked={value.paesi_terzi_ue}
              onChange={(e) =>
                onChange({ ...value, paesi_terzi_ue: e.target.checked })
              }
            />
          }
          label="Paesi terzi UE (extra-UE)"
        />
        <FormControlLabel
          control={
            <Switch
              checked={value.invalido}
              onChange={(e) =>
                onChange({ ...value, invalido: e.target.checked })
              }
            />
          }
          label="Invalido"
        />
      </Stack>
    </Box>
  );
}

// ---- Pagina principale ----
export default function DettaglioUtente() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Stato form nucleo
  const [numeroNucleoFamiliare, setNumeroNucleoFamiliare] = useState("");
  const [cfTesserato, setCfTesserato] = useState("");
  const [numeroTessera, setNumeroTessera] = useState("");
  const [scadenzaTessera, setScadenzaTessera] = useState("");
  const [telefono, setTelefono] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [zona, setZona] = useState("");
  const [stato, setStato] = useState<StatoNucleo>("verde");

  // Stato componenti
  const [stessoSoggetto, setStessoSoggetto] = useState(true);
  const [capofamiglia, setCapofamiglia] = useState<PersonaForm>({
    ...PERSONA_VUOTA,
  });
  const [titolare, setTitolare] = useState<PersonaForm>({ ...PERSONA_VUOTA });
  const [componentiExtra, setComponentiExtra] = useState<PersonaForm[]>([]);

  // Stato iscrizioni tessera
  type Iscrizione = {
    id: string;
    numero_tessera: string;
    data_inizio: string | null;
    data_scadenza: string | null;
    note: string | null;
    created_at: string;
  };
  const [iscrizioni, setIscrizioni] = useState<Iscrizione[]>([]);
  const [storicoOpen, setStoricoOpen] = useState(false);
  const [nuovaIscrizione, setNuovaIscrizione] = useState({
    numero_tessera: "",
    data_inizio: "",
    data_scadenza: "",
    note: "",
  });
  const [savingIscrizione, setSavingIscrizione] = useState(false);
  const [deletingIscrizioneId, setDeletingIscrizioneId] = useState<
    string | null
  >(null);
  const [storicoSortBy, setStoricoSortBy] =
    useState<StoricoIscrizioniSortKey>("registrataIl");
  const [storicoSortDir, setStoricoSortDir] = useState<SortDirection>("desc");

  // Storico distribuzioni
  const [storicoDistOpen, setStoricoDistOpen] = useState(false);

  // Dialog import Excel
  const [excelOpen, setExcelOpen] = useState(false);
  const [excelText, setExcelText] = useState("");

  const handleStoricoSort = (column: StoricoIscrizioniSortKey) => {
    if (storicoSortBy === column) {
      setStoricoSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setStoricoSortBy(column);
    setStoricoSortDir(
      column === "registrataIl" || column === "scadenza" ? "desc" : "asc",
    );
  };

  const storicoHeaders: Array<{
    key: StoricoIscrizioniSortKey;
    label: string;
  }> = [
    { key: "numeroTessera", label: "N. Tessera" },
    { key: "dataInizio", label: "Data inizio" },
    { key: "scadenza", label: "Scadenza" },
    { key: "note", label: "Note" },
    { key: "registrataIl", label: "Registrata il" },
  ];

  const sortedIscrizioni = [...iscrizioni].sort((a, b) => {
    const valueA = {
      numeroTessera: a.numero_tessera,
      dataInizio: a.data_inizio ?? null,
      scadenza: a.data_scadenza ?? null,
      note: a.note ?? null,
      registrataIl: a.created_at,
    }[storicoSortBy];
    const valueB = {
      numeroTessera: b.numero_tessera,
      dataInizio: b.data_inizio ?? null,
      scadenza: b.data_scadenza ?? null,
      note: b.note ?? null,
      registrataIl: b.created_at,
    }[storicoSortBy];
    const result = compareValues(valueA, valueB);
    if (result !== 0) return storicoSortDir === "asc" ? result : -result;
    return b.created_at.localeCompare(a.created_at);
  });

  useEffect(() => {
    if (!id) return;
    const carica = async () => {
      setPageLoading(true);
      const { data: nucl, error: e1 } = await supabase
        .from("nuclei")
        .select("*")
        .eq("id", id)
        .single();
      const { data: comps, error: e2 } = await supabase
        .from("componenti")
        .select("*")
        .eq("nucleo_id", id)
        .order("created_at");
      const { data: isc, error: e3 } = await supabase
        .from("iscrizioni")
        .select(
          "id, numero_tessera, data_inizio, data_scadenza, note, created_at",
        )
        .eq("nucleo_id", id)
        .order("created_at", { ascending: false });

      if (e1 || e2 || e3) {
        setError("Errore nel caricamento dei dati.");
        setPageLoading(false);
        return;
      }

      // Popola stato form
      setNumeroNucleoFamiliare(nucl.numero_nucleo_familiare ?? "");
      setTelefono(nucl.telefono ?? "");
      setIndirizzo(nucl.indirizzo ?? "");
      setZona(nucl.zona ?? "");
      setStato(nucl.stato ?? "verde");

      const capoFound = comps?.find(
        (c: { ruolo: string }) => c.ruolo === "capofamiglia",
      );
      const titolFound = comps?.find(
        (c: { ruolo: string }) => c.ruolo === "titolare",
      );
      const extrasFound =
        comps?.filter((c: { ruolo: string }) => c.ruolo === "componente") ?? [];

      if (capoFound) {
        setCapofamiglia({
          nome: capoFound.nome ?? "",
          cognome: capoFound.cognome ?? "",
          data_nascita: capoFound.data_nascita ?? "",
          nazione_nascita: capoFound.nazione_nascita ?? "",
          nazionalita: capoFound.nazionalita ?? "",
          sesso: capoFound.sesso ?? "",
          paesi_terzi_ue: Boolean(capoFound.paesi_terzi_ue),
          invalido: Boolean(capoFound.invalido),
        });
      }
      setStessoSoggetto(!titolFound);
      if (titolFound) {
        setTitolare({
          nome: titolFound.nome ?? "",
          cognome: titolFound.cognome ?? "",
          data_nascita: titolFound.data_nascita ?? "",
          nazione_nascita: titolFound.nazione_nascita ?? "",
          nazionalita: titolFound.nazionalita ?? "",
          sesso: titolFound.sesso ?? "",
          paesi_terzi_ue: Boolean(titolFound.paesi_terzi_ue),
          invalido: Boolean(titolFound.invalido),
        });
      }

      const riferimentoCf = titolFound ?? capoFound;
      setCfTesserato(
        riferimentoCf?.codice_fiscale ?? nucl.codice_fiscale ?? "",
      );

      setComponentiExtra(
        extrasFound.map(
          (c: {
            nome: string;
            cognome: string;
            data_nascita: string | null;
            nazione_nascita: string | null;
            nazionalita: string | null;
            sesso: "M" | "F" | null;
            paesi_terzi_ue: boolean;
            invalido: boolean;
            codice_fiscale?: string | null;
          }) => ({
            nome: c.nome ?? "",
            cognome: c.cognome ?? "",
            data_nascita: c.data_nascita ?? "",
            nazione_nascita: c.nazione_nascita ?? "",
            nazionalita: c.nazionalita ?? "",
            sesso: c.sesso ?? "",
            paesi_terzi_ue: Boolean(c.paesi_terzi_ue),
            invalido: Boolean(c.invalido),
          }),
        ),
      );

      setIscrizioni(isc ?? []);
      if (isc && isc.length > 0) {
        setNumeroTessera(isc[0].numero_tessera ?? "");
        setScadenzaTessera(isc[0].data_scadenza ?? "");
        setNuovaIscrizione((prev) => ({
          ...prev,
          numero_tessera: isc[0].numero_tessera,
        }));
      } else {
        setNumeroTessera("");
        setScadenzaTessera("");
      }

      setPageLoading(false);
    };
    carica();
  }, [id]);

  const addComponente = () =>
    setComponentiExtra((prev) => [...prev, { ...PERSONA_VUOTA }]);
  const removeComponente = (i: number) =>
    setComponentiExtra((prev) => prev.filter((_, idx) => idx !== i));
  const updateComponente = (i: number, v: PersonaForm) =>
    setComponentiExtra((prev) => prev.map((c, idx) => (idx === i ? v : c)));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zona) {
      setError("Seleziona una zona.");
      return;
    }
    if (!capofamiglia.cognome || !capofamiglia.nome) {
      setError("Inserisci almeno cognome e nome del capofamiglia.");
      return;
    }
    setError("");
    setSaving(true);

    const latestIscrizione = iscrizioni[0] ?? null;
    const normalizedNumeroNucleoFamiliare = numeroNucleoFamiliare.trim();
    const normalizedCf = cfTesserato.trim().toUpperCase();
    const normalizedNumeroTessera = numeroTessera.trim();
    const normalizedScadenzaTessera = scadenzaTessera || null;
    const scadenzaYear = getYearFromIsoDate(normalizedScadenzaTessera);
    const numeroTesseraChanged =
      normalizedNumeroTessera !== (latestIscrizione?.numero_tessera ?? "");
    const scadenzaTesseraChanged =
      normalizedScadenzaTessera !== (latestIscrizione?.data_scadenza ?? null);
    const shouldCreateRinnovo =
      Boolean(normalizedNumeroTessera) &&
      (!latestIscrizione || numeroTesseraChanged || scadenzaTesseraChanged);

    if (normalizedNumeroTessera && !scadenzaYear) {
      setError(
        "Per verificare il numero tessera devi indicare una data di scadenza valida.",
      );
      setSaving(false);
      return;
    }

    if (normalizedNumeroNucleoFamiliare) {
      const { data: duplicateNucleo, error: nucleoCheckErr } = await supabase
        .from("nuclei")
        .select("id")
        .eq("numero_nucleo_familiare", normalizedNumeroNucleoFamiliare)
        .neq("id", id)
        .limit(1)
        .maybeSingle();

      if (nucleoCheckErr) {
        setError(nucleoCheckErr.message);
        setSaving(false);
        return;
      }

      if (duplicateNucleo) {
        setError("Numero nucleo familiare gia presente.");
        setSaving(false);
        return;
      }
    }

    if (normalizedCf) {
      const { data: duplicateCf, error: cfCheckErr } = await supabase
        .from("componenti")
        .select("id, nucleo_id")
        .eq("codice_fiscale", normalizedCf)
        .neq("nucleo_id", id)
        .limit(1)
        .maybeSingle();

      if (cfCheckErr) {
        setError(cfCheckErr.message);
        setSaving(false);
        return;
      }

      if (duplicateCf) {
        setError("Codice fiscale gia presente su un altro nucleo.");
        setSaving(false);
        return;
      }
    }

    if (normalizedNumeroTessera && scadenzaYear) {
      const startOfYear = `${scadenzaYear}-01-01`;
      const endOfYear = `${scadenzaYear}-12-31`;
      const { data: duplicateTessera, error: tesseraCheckErr } = await supabase
        .from("iscrizioni")
        .select("id, nucleo_id")
        .eq("numero_tessera", normalizedNumeroTessera)
        .neq("nucleo_id", id)
        .gte("data_scadenza", startOfYear)
        .lte("data_scadenza", endOfYear)
        .limit(1)
        .maybeSingle();

      if (tesseraCheckErr) {
        setError(tesseraCheckErr.message);
        setSaving(false);
        return;
      }

      if (duplicateTessera) {
        setError(
          `Numero tessera gia presente per l'anno di scadenza ${scadenzaYear}.`,
        );
        setSaving(false);
        return;
      }
    }

    // 1. Aggiorna nucleo
    const { error: nuclErr } = await supabase
      .from("nuclei")
      .update({
        numero_nucleo_familiare: normalizedNumeroNucleoFamiliare || null,
        codice_fiscale: null,
        telefono: telefono.trim() || null,
        indirizzo: indirizzo.trim() || null,
        zona,
        stato,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (nuclErr) {
      setError(nuclErr.message);
      setSaving(false);
      return;
    }

    // 2. Rimuovi tutti i componenti e re-inserisci (approccio semplice)
    const { error: deleteCompErr } = await supabase
      .from("componenti")
      .delete()
      .eq("nucleo_id", id);

    if (deleteCompErr) {
      setError(`Errore rimozione componenti: ${deleteCompErr.message}`);
      setSaving(false);
      return;
    }

    const cfNorm = normalizedCf || null;

    const toInsert = [
      {
        nucleo_id: id,
        ruolo: "capofamiglia",
        nome: capofamiglia.nome,
        cognome: capofamiglia.cognome,
        codice_fiscale: stessoSoggetto ? cfNorm : null,
        data_nascita: capofamiglia.data_nascita || null,
        nazione_nascita: capofamiglia.nazione_nascita || null,
        nazionalita: capofamiglia.nazionalita || null,
        sesso: capofamiglia.sesso || null,
        paesi_terzi_ue: capofamiglia.paesi_terzi_ue,
        invalido: capofamiglia.invalido,
        fascia_eta: calcFascia(capofamiglia.data_nascita),
      },
    ];
    if (!stessoSoggetto && (titolare.cognome || titolare.nome)) {
      toInsert.push({
        nucleo_id: id,
        ruolo: "titolare",
        nome: titolare.nome,
        cognome: titolare.cognome,
        codice_fiscale: cfNorm,
        data_nascita: titolare.data_nascita || null,
        nazione_nascita: titolare.nazione_nascita || null,
        nazionalita: titolare.nazionalita || null,
        sesso: titolare.sesso || null,
        paesi_terzi_ue: titolare.paesi_terzi_ue,
        invalido: titolare.invalido,
        fascia_eta: calcFascia(titolare.data_nascita),
      });
    }
    componentiExtra.forEach((c) => {
      if (c.cognome || c.nome) {
        toInsert.push({
          nucleo_id: id,
          ruolo: "componente",
          nome: c.nome,
          cognome: c.cognome,
          codice_fiscale: null,
          data_nascita: c.data_nascita || null,
          nazione_nascita: c.nazione_nascita || null,
          nazionalita: c.nazionalita || null,
          sesso: c.sesso || null,
          paesi_terzi_ue: c.paesi_terzi_ue,
          invalido: c.invalido,
          fascia_eta: calcFascia(c.data_nascita),
        });
      }
    });

    const { error: compErr } = await supabase
      .from("componenti")
      .insert(toInsert);
    if (compErr) {
      setError(`Errore inserimento componenti: ${compErr.message}`);
      setSaving(false);
      return;
    }

    if (shouldCreateRinnovo) {
      const { data: newIscrizione, error: iscrErr } = await supabase
        .from("iscrizioni")
        .insert({
          nucleo_id: id,
          numero_tessera: normalizedNumeroTessera,
          data_scadenza: normalizedScadenzaTessera,
          note: "Rinnovo registrato da modifica nucleo",
        })
        .select(
          "id, numero_tessera, data_inizio, data_scadenza, note, created_at",
        )
        .single();

      if (iscrErr || !newIscrizione) {
        setError(iscrErr?.message ?? "Errore salvataggio rinnovo iscrizione.");
        setSaving(false);
        return;
      }

      setIscrizioni((prev) => [newIscrizione, ...prev]);
      setNuovaIscrizione({
        numero_tessera: newIscrizione.numero_tessera,
        data_inizio: "",
        data_scadenza: "",
        note: "",
      });
    }

    setSaving(false);
    setSuccessMsg("Dati salvati correttamente.");
  };

  const handleImportaExcel = () => {
    const persone = parsePastedPersoneFromExcel(excelText);
    if (persone.length === 0) return;
    // Il primo diventa capofamiglia (se vuoto), gli altri vanno in componentiExtra
    if (!capofamiglia.cognome && !capofamiglia.nome && persone[0]) {
      setCapofamiglia(persone[0]);
      setComponentiExtra((prev) => [...prev, ...persone.slice(1)]);
    } else {
      setComponentiExtra((prev) => [...prev, ...persone]);
    }
    setExcelText("");
    setExcelOpen(false);
  };

  const handleSalvaIscrizione = async () => {
    if (!nuovaIscrizione.numero_tessera.trim()) return;
    setSavingIscrizione(true);
    const { data: newIscr, error: iscrErr } = await supabase
      .from("iscrizioni")
      .insert({
        nucleo_id: id,
        numero_tessera: nuovaIscrizione.numero_tessera.trim(),
        data_inizio: nuovaIscrizione.data_inizio || null,
        data_scadenza: nuovaIscrizione.data_scadenza || null,
        note: nuovaIscrizione.note.trim() || null,
      })
      .select(
        "id, numero_tessera, data_inizio, data_scadenza, note, created_at",
      )
      .single();
    setSavingIscrizione(false);
    if (iscrErr || !newIscr) {
      setError(iscrErr?.message ?? "Errore salvataggio iscrizione.");
      return;
    }
    setIscrizioni((prev) => [newIscr, ...prev]);
    setNuovaIscrizione({
      numero_tessera: newIscr.numero_tessera,
      data_inizio: "",
      data_scadenza: "",
      note: "",
    });
  };

  const handleDeleteIscrizione = async (iscrizioneId: string) => {
    setDeletingIscrizioneId(iscrizioneId);
    const { error: deleteErr } = await supabase
      .from("iscrizioni")
      .delete()
      .eq("id", iscrizioneId);

    setDeletingIscrizioneId(null);

    if (deleteErr) {
      setError(deleteErr.message);
      return;
    }

    setIscrizioni((prev) => prev.filter((item) => item.id !== iscrizioneId));
  };

  if (pageLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "40vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={handleSave}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Utenti &gt; Modifica Nucleo Familiare
      </Typography>

      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 3.2,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
              Anagrafica Nucleo
            </Typography>
            <StatusChip stato={stato} />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Modifica dati e composizione del nucleo assistito.
          </Typography>
        </Box>
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            startIcon={<TableRowsIcon />}
            onClick={() => setExcelOpen(true)}
          >
            Copia-incolla da Excel
          </Button>
          <Button
            variant="text"
            color="inherit"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate("/utenti")}
          >
            Annulla
          </Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={saving}
            sx={{ minWidth: 130 }}
          >
            {saving ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Salva Nucleo"
            )}
          </Button>
        </Stack>
      </Box>

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

      <Stack sx={{ gap: 3.4 }}>
        {/* Sezione: Dati nucleo */}
        <Paper
          variant="outlined"
          sx={{ borderRadius: 3, overflow: "hidden", mt: 0.4 }}
        >
          <Box
            sx={{
              px: 3,
              py: 2,
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <BadgeOutlinedIcon color="success" fontSize="small" />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Identificazione Nucleo
            </Typography>
          </Box>
          <Box sx={{ p: { xs: 2.6, md: 3.2 } }}>
            <Stack sx={{ gap: 2.2 }}>
              <Stack direction="row" sx={{ gap: 2.2, flexWrap: "wrap" }}>
                <TextField
                  label="Numero nucleo familiare"
                  value={numeroNucleoFamiliare}
                  onChange={(e) => setNumeroNucleoFamiliare(e.target.value)}
                  sx={{ flex: 1, minWidth: 220 }}
                />
                <TextField
                  label="Numero tessera"
                  value={numeroTessera}
                  onChange={(e) => setNumeroTessera(e.target.value)}
                  placeholder="Inserisci numero tessera"
                  sx={{ flex: 1, minWidth: 220 }}
                />
                <TextField
                  label="Scadenza"
                  type="date"
                  value={scadenzaTessera}
                  onChange={(e) => setScadenzaTessera(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ flex: 1, minWidth: 220 }}
                />

                <TextField
                  select
                  label="Zona"
                  value={zona}
                  onChange={(e) => setZona(e.target.value)}
                  required
                  sx={{ flex: 1, minWidth: 220 }}
                >
                  {ZONE.map((z) => (
                    <MenuItem key={z} value={z}>
                      {z}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Stato"
                  value={stato}
                  onChange={(e) => setStato(e.target.value as StatoNucleo)}
                  sx={{ flex: 1, minWidth: 220 }}
                >
                  {STATI.map((s) => (
                    <MenuItem key={s.value} value={s.value}>
                      {s.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Stack direction="row" sx={{ gap: 2.2, flexWrap: "wrap" }}>
                <TextField
                  label="Codice Fiscale del tesserato"
                  value={cfTesserato}
                  onChange={(e) => setCfTesserato(e.target.value.toUpperCase())}
                  slotProps={{ htmlInput: { maxLength: 16 } }}
                  sx={{ flex: 1, minWidth: 220 }}
                />
                <TextField
                  label="Telefono"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  sx={{ flex: 1, minWidth: 220 }}
                />
                <TextField
                  label="Indirizzo"
                  value={indirizzo}
                  onChange={(e) => setIndirizzo(e.target.value)}
                  sx={{ flex: 1, minWidth: 220 }}
                />
              </Stack>
              <Stack direction="row" sx={{ gap: 2.2, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  startIcon={<HistoryIcon />}
                  onClick={() => setStoricoOpen(true)}
                  sx={{ alignSelf: "center", minWidth: 200, height: 56 }}
                >
                  Storico iscrizioni
                  {iscrizioni.length > 0 && (
                    <Chip
                      label={iscrizioni.length}
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  )}
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<HistoryIcon />}
                  onClick={() => setStoricoDistOpen(true)}
                  sx={{ alignSelf: "center", minWidth: 220, height: 56 }}
                >
                  Storico distribuzioni
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Paper>

        {/* Sezione: Persone */}
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <Box
            sx={{
              px: 3,
              py: 2,
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Groups2OutlinedIcon color="success" fontSize="small" />
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Titolare e Capofamiglia
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Titolare coincide con Capofamiglia
              </Typography>
              <Switch
                checked={stessoSoggetto}
                onChange={(e) => setStessoSoggetto(e.target.checked)}
              />
            </Stack>
          </Box>
          <Box sx={{ p: 3 }}>
            <Stack sx={{ gap: 3 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ letterSpacing: 0.8, fontWeight: 700 }}
              >
                DATI TITOLARE
              </Typography>
              <SezionePersona
                value={capofamiglia}
                onChange={setCapofamiglia}
                label=""
              />
              {!stessoSoggetto && (
                <>
                  <Divider />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ letterSpacing: 0.8, fontWeight: 700 }}
                  >
                    DATI CAPOFAMIGLIA
                  </Typography>
                  <SezionePersona
                    value={titolare}
                    onChange={setTitolare}
                    label=""
                  />
                </>
              )}
              {stessoSoggetto && (
                <Typography variant="caption" color="text.secondary">
                  I dati del capofamiglia coincidono con quelli del titolare.
                </Typography>
              )}
            </Stack>
          </Box>
        </Paper>

        {/* Sezione: Altri componenti */}
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <Box
            sx={{
              px: 3,
              py: 2,
              borderBottom: 1,
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <HomeOutlinedIcon color="success" fontSize="small" />
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Componenti del Nucleo
              </Typography>
            </Box>
            <Button
              startIcon={<AddIcon />}
              onClick={addComponente}
              size="small"
            >
              Aggiungi
            </Button>
          </Box>
          <Box sx={{ p: 3 }}>
            {componentiExtra.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                Nessun altro componente.
              </Typography>
            ) : (
              <Stack sx={{ gap: 3 }}>
                {componentiExtra.map((c, i) => (
                  <Box key={i}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mb: 1,
                      }}
                    >
                      <Typography variant="subtitle2" color="text.secondary">
                        Componente {i + 1}
                      </Typography>
                      <Tooltip title="Rimuovi">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => removeComponente(i)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <SezionePersona
                      value={c}
                      onChange={(v) => updateComponente(i, v)}
                      label=""
                    />
                    {i < componentiExtra.length - 1 && (
                      <Divider sx={{ mt: 2 }} />
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Paper>
      </Stack>

      {/* Dialog storico distribuzioni */}
      <StoricoDistribuzioniDialog
        nucleoId={storicoDistOpen ? (id ?? null) : null}
        nucleoLabel={
          `${capofamiglia.cognome} ${capofamiglia.nome}`.trim() || undefined
        }
        onClose={() => setStoricoDistOpen(false)}
      />

      {/* Dialog storico iscrizioni */}
      <Dialog
        open={storicoOpen}
        onClose={() => setStoricoOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <HistoryIcon color="success" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Storico Iscrizioni
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {/* Tabella storico */}
          {iscrizioni.length === 0 ? (
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Nessuna iscrizione registrata.
            </Typography>
          ) : (
            <Table size="small" sx={{ mb: 3 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  {storicoHeaders.map((header) => (
                    <TableCell
                      key={header.key}
                      sortDirection={
                        storicoSortBy === header.key ? storicoSortDir : false
                      }
                    >
                      <TableSortLabel
                        active={storicoSortBy === header.key}
                        direction={
                          storicoSortBy === header.key ? storicoSortDir : "desc"
                        }
                        onClick={() => handleStoricoSort(header.key)}
                      >
                        <Box
                          component="span"
                          sx={{
                            fontWeight: 700,
                            fontSize: "0.75rem",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            color: "text.secondary",
                          }}
                        >
                          {header.label}
                        </Box>
                      </TableSortLabel>
                    </TableCell>
                  ))}
                  <TableCell align="right">
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 700,
                        fontSize: "0.75rem",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        color: "text.secondary",
                      }}
                    >
                      Azioni
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedIscrizioni.map((isc, i) => (
                  <TableRow
                    key={isc.id}
                    sx={i === 0 ? { bgcolor: "rgba(26,110,60,0.06)" } : {}}
                  >
                    <TableCell sx={{ fontWeight: i === 0 ? 700 : 400 }}>
                      {isc.numero_tessera}
                    </TableCell>
                    <TableCell>
                      {isc.data_inizio
                        ? new Date(isc.data_inizio).toLocaleDateString("it-IT")
                        : "—"}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: i === 0 ? 700 : 400,
                        color: i === 0 ? "success.dark" : "text.primary",
                      }}
                    >
                      {isc.data_scadenza
                        ? new Date(isc.data_scadenza).toLocaleDateString(
                            "it-IT",
                          )
                        : "—"}
                    </TableCell>
                    <TableCell>{isc.note ?? "—"}</TableCell>
                    <TableCell
                      sx={{ color: "text.secondary", fontSize: "0.8rem" }}
                    >
                      {new Date(isc.created_at).toLocaleDateString("it-IT")}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Elimina riga">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={deletingIscrizioneId === isc.id}
                            onClick={() => handleDeleteIscrizione(isc.id)}
                          >
                            {deletingIscrizioneId === isc.id ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : (
                              <DeleteIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <Divider sx={{ mb: 2.5 }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
            Aggiungi rinnovo
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ gap: 2, flexWrap: "wrap" }}
          >
            <TextField
              label="Numero tessera"
              required
              value={nuovaIscrizione.numero_tessera}
              onChange={(e) =>
                setNuovaIscrizione((p) => ({
                  ...p,
                  numero_tessera: e.target.value,
                }))
              }
              sx={{ flex: 1, minWidth: 180 }}
            />
            <TextField
              label="Data inizio"
              type="date"
              value={nuovaIscrizione.data_inizio}
              onChange={(e) =>
                setNuovaIscrizione((p) => ({
                  ...p,
                  data_inizio: e.target.value,
                }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1, minWidth: 180 }}
            />
            <TextField
              label="Scadenza"
              type="date"
              value={nuovaIscrizione.data_scadenza}
              onChange={(e) =>
                setNuovaIscrizione((p) => ({
                  ...p,
                  data_scadenza: e.target.value,
                }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1, minWidth: 180 }}
            />
            <TextField
              label="Note"
              value={nuovaIscrizione.note}
              onChange={(e) =>
                setNuovaIscrizione((p) => ({ ...p, note: e.target.value }))
              }
              sx={{ flex: 2, minWidth: 200 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStoricoOpen(false)}>Chiudi</Button>
          <Button
            variant="contained"
            startIcon={
              savingIscrizione ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <AddIcon />
              )
            }
            disabled={
              savingIscrizione || !nuovaIscrizione.numero_tessera.trim()
            }
            onClick={handleSalvaIscrizione}
          >
            Salva rinnovo
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog import Excel */}
      <Dialog
        open={excelOpen}
        onClose={() => setExcelOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Importa componenti da Excel</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Copia le celle da Excel e incollale qui sotto. Il formato atteso è:
            <br />
            <strong>
              Cognome [TAB] Nome [TAB] Data nascita [TAB] Nazionalità
            </strong>
            <br />
            oppure, copiando direttamente dal file FEAD 2026, vengono rilevate
            automaticamente tutte le colonne (Nazione di nascita, Nazionalità,
            Sesso, Invalido, Paesi Terzi). La data può essere nel formato
            GG/MM/AAAA oppure AAAA-MM-GG. Se la prima riga è un'intestazione
            viene ignorata automaticamente.
          </Typography>
          <TextField
            multiline
            rows={8}
            fullWidth
            placeholder={
              "Rossi\tMario\t01/01/1970\titaliana\nRossi\tMaria\t15/06/1995\titaliana"
            }
            value={excelText}
            onChange={(e) => setExcelText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setExcelOpen(false);
              setExcelText("");
            }}
          >
            Annulla
          </Button>
          <Button
            variant="contained"
            onClick={handleImportaExcel}
            disabled={!excelText.trim()}
          >
            Importa
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
