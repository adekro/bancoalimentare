import { useEffect, useState } from "react";
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
  IconButton,
  Tooltip,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import Groups2OutlinedIcon from "@mui/icons-material/Groups2Outlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabase";
import NationalityAutocomplete from "@/components/common/NationalityAutocomplete";
import type { StatoNucleo } from "@/components/common/StatusChip";
import type { PastedPersona } from "../../utils/personaExcelPaste";
import type { NucleoIdentificazione } from "../../utils/personaExcelPaste";

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
  required,
}: {
  value: PersonaForm;
  onChange: (v: PersonaForm) => void;
  label: string;
  required?: boolean;
}) {
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
        {label}
      </Typography>
      <Stack direction="row" sx={{ gap: 2.5, flexWrap: "wrap" }}>
        <TextField
          label="Cognome"
          value={value.cognome}
          required={required}
          onChange={(e) => onChange({ ...value, cognome: e.target.value })}
          sx={{ flex: 1, minWidth: 160 }}
        />
        <TextField
          label="Nome"
          value={value.nome}
          required={required}
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
            <Checkbox
              checked={value.paesi_terzi_ue}
              onChange={(e) =>
                onChange({ ...value, paesi_terzi_ue: e.target.checked })
              }
            />
          }
          label="Paesi terzi UE (extra-UE)"
          sx={{ mt: 1.2 }}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={value.invalido}
              onChange={(e) =>
                onChange({ ...value, invalido: e.target.checked })
              }
            />
          }
          label="Invalido"
          sx={{ mt: 1.2 }}
        />
      </Stack>
    </Box>
  );
}

// ---- Pagina principale ----
export default function NuovoUtente() {
  const navigate = useNavigate();
  const location = useLocation();
  const [cfTesserato, setCfTesserato] = useState("");
  const [numeroNucleoFamiliare, setNumeroNucleoFamiliare] = useState("");
  const [numeroComponenti, setNumeroComponenti] = useState("");
  const [zona, setZona] = useState("");
  const [telefono, setTelefono] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [stessoSoggetto, setStessoSoggetto] = useState(true);
  const [capofamiglia, setCapofamiglia] = useState<PersonaForm>({
    ...PERSONA_VUOTA,
  });
  const [titolare, setTitolare] = useState<PersonaForm>({ ...PERSONA_VUOTA });
  const [componentiExtra, setComponentiExtra] = useState<PersonaForm[]>([]);
  const [stato, setStato] = useState<StatoNucleo>("bozza");
  const [tessNumero, setTessNumero] = useState("");
  const [tessDataScadenza, setTessDataScadenza] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const state = location.state as {
      excelPersone?: PastedPersona[];
      excelCfIdx?: number;
      excelTitIdx?: number | null;
      excelNucleo?: NucleoIdentificazione;
    } | null;

    const importedPeople = state?.excelPersone;
    if (!importedPeople || importedPeople.length === 0) return;

    const cfIdx = state?.excelCfIdx ?? 0;
    const titIdx = state?.excelTitIdx ?? null; // null = stesso del capofamiglia

    const cf = importedPeople[cfIdx] ?? importedPeople[0];
    setCapofamiglia(cf);

    if (titIdx !== null && titIdx !== cfIdx && importedPeople[titIdx]) {
      setStessoSoggetto(false);
      setTitolare(importedPeople[titIdx]);
    } else {
      setStessoSoggetto(true);
    }

    const extra = importedPeople.filter((_, i) => {
      if (i === cfIdx) return false;
      if (titIdx !== null && i === titIdx) return false;
      return true;
    });
    setComponentiExtra(extra);

    // Pre-popola Identificazione Nucleo
    const nucleo = state?.excelNucleo;
    if (nucleo) {
      if (nucleo.zona) setZona(nucleo.zona);
      if (nucleo.numero_nucleo) setNumeroNucleoFamiliare(nucleo.numero_nucleo);
      if (nucleo.numero_tessera) setTessNumero(nucleo.numero_tessera);
      if (nucleo.scadenza_tessera) setTessDataScadenza(nucleo.scadenza_tessera);
      if (nucleo.telefono) setTelefono(nucleo.telefono);
      if (nucleo.indirizzo) setIndirizzo(nucleo.indirizzo);
      if (nucleo.codice_fiscale_tesserato)
        setCfTesserato(nucleo.codice_fiscale_tesserato);
      if (nucleo.numero_componenti) setNumeroComponenti(nucleo.numero_componenti);
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (stessoSoggetto) {
      setTitolare({ ...capofamiglia });
    }
  }, [stessoSoggetto, capofamiglia]);

  const addComponente = () =>
    setComponentiExtra((prev) => [...prev, { ...PERSONA_VUOTA }]);

  const removeComponente = (i: number) =>
    setComponentiExtra((prev) => prev.filter((_, idx) => idx !== i));

  const updateComponente = (i: number, v: PersonaForm) =>
    setComponentiExtra((prev) => prev.map((c, idx) => (idx === i ? v : c)));

  const handleSubmit = async (e: React.FormEvent) => {
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
    setLoading(true);

    const normalizedNumeroNucleoFamiliare = numeroNucleoFamiliare.trim();
    const normalizedCf = cfTesserato.trim().toUpperCase();
    const normalizedTessNumero = tessNumero.trim();
    const normalizedNumeroComponenti = numeroComponenti.trim();
    const numeroComponentiValue =
      normalizedNumeroComponenti === ""
        ? null
        : Number.parseInt(normalizedNumeroComponenti, 10);
    const tesseraYear = getYearFromIsoDate(tessDataScadenza || null);

    if (
      normalizedNumeroComponenti !== "" &&
      (numeroComponentiValue == null ||
        !Number.isInteger(numeroComponentiValue) ||
        numeroComponentiValue < 0)
    ) {
      setError("Numero componenti non valido.");
      setLoading(false);
      return;
    }

    if (normalizedTessNumero && !tesseraYear) {
      setError(
        "Per verificare il numero tessera devi indicare una data di scadenza valida.",
      );
      setLoading(false);
      return;
    }

    if (normalizedNumeroNucleoFamiliare) {
      const { data: duplicateNucleo, error: nucleoCheckErr } = await supabase
        .from("nuclei")
        .select("id")
        .eq("numero_nucleo_familiare", normalizedNumeroNucleoFamiliare)
        .limit(1)
        .maybeSingle();

      if (nucleoCheckErr) {
        setError(nucleoCheckErr.message);
        setLoading(false);
        return;
      }

      if (duplicateNucleo) {
        setError("Numero nucleo familiare gia presente.");
        setLoading(false);
        return;
      }
    }

    if (normalizedCf) {
      const { data: duplicateCf, error: cfCheckErr } = await supabase
        .from("componenti")
        .select("id")
        .eq("codice_fiscale", normalizedCf)
        .limit(1)
        .maybeSingle();

      if (cfCheckErr) {
        setError(cfCheckErr.message);
        setLoading(false);
        return;
      }

      if (duplicateCf) {
        setError("Codice fiscale gia presente su un altro nucleo.");
        setLoading(false);
        return;
      }
    }

    if (normalizedTessNumero && tesseraYear) {
      const startOfYear = `${tesseraYear}-01-01`;
      const endOfYear = `${tesseraYear}-12-31`;
      const { data: duplicateTessera, error: tesseraCheckErr } = await supabase
        .from("iscrizioni")
        .select("id")
        .eq("numero_tessera", normalizedTessNumero)
        .gte("data_scadenza", startOfYear)
        .lte("data_scadenza", endOfYear)
        .limit(1)
        .maybeSingle();

      if (tesseraCheckErr) {
        setError(tesseraCheckErr.message);
        setLoading(false);
        return;
      }

      if (duplicateTessera) {
        setError(
          `Numero tessera gia presente per l'anno di scadenza ${tesseraYear}.`,
        );
        setLoading(false);
        return;
      }
    }

    // 1. Insert nucleo
    const { data: nuclData, error: nuclErr } = await supabase
      .from("nuclei")
      .insert({
        numero_nucleo_familiare: normalizedNumeroNucleoFamiliare || null,
        numero_componenti: numeroComponentiValue,
        telefono: telefono.trim() || null,
        indirizzo: indirizzo.trim() || null,
        zona,
        stato,
        archiviato: false,
      })
      .select("id")
      .single();

    if (nuclErr || !nuclData) {
      setError(nuclErr?.message ?? "Errore durante il salvataggio del nucleo.");
      setLoading(false);
      return;
    }

    const nucleoId = nuclData.id;

    // 2. Insert componenti
    const cfNorm = normalizedCf || null;

    const toInsert = [
      {
        nucleo_id: nucleoId,
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
        nucleo_id: nucleoId,
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
          nucleo_id: nucleoId,
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
      setError(compErr.message);
      setLoading(false);
      return;
    }

    // 3. Insert prima iscrizione (se compilata)
    if (normalizedTessNumero) {
      const { error: iscrErr } = await supabase.from("iscrizioni").insert({
        nucleo_id: nucleoId,
        numero_tessera: normalizedTessNumero,
        data_scadenza: tessDataScadenza || null,
      });
      if (iscrErr) {
        setError(iscrErr.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    navigate(`/utenti/${nucleoId}`);
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Stack
        direction="row"
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}
      >
        <Typography variant="body2" color="text.secondary">
          Utenti &gt; Nuovo Nucleo Familiare
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          mb: 3.2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
            Anagrafica Nucleo
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Inserisci i dati per la creazione di un nuovo nucleo assistito.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.2}>
          <Button
            variant="text"
            color="inherit"
            onClick={() => navigate("/utenti")}
          >
            Annulla
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{ minWidth: 154 }}
          >
            {loading ? (
              <CircularProgress size={22} color="inherit" />
            ) : (
              "Salva Nucleo"
            )}
          </Button>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack sx={{ gap: 3.4 }}>
        {/* Sezione: Identificazione nucleo */}
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
            <Stack sx={{ gap: 2.6 }}>
              <Stack direction={{ xs: "column", md: "row" }} sx={{ gap: 2.2 }}>
                <TextField
                  label="Numero nucleo familiare"
                  value={numeroNucleoFamiliare}
                  onChange={(e) => setNumeroNucleoFamiliare(e.target.value)}
                  sx={{ flex: 1, minWidth: { md: 220 } }}
                />

                <TextField
                  label="Numero Tessera"
                  placeholder="Es. BA-2024-001"
                  value={tessNumero}
                  onChange={(e) => setTessNumero(e.target.value)}
                  sx={{ flex: 1, minWidth: { md: 220 } }}
                />

                <TextField
                  label="Scadenza Tessera"
                  type="date"
                  value={tessDataScadenza}
                  onChange={(e) => setTessDataScadenza(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{
                    flex: 1,
                    minWidth: { md: 220 },
                    "& input": { fontSize: "0.97rem" },
                    "& .MuiInputLabel-root": {
                      px: 0.35,
                      bgcolor: "background.paper",
                    },
                  }}
                />
                <TextField
                  select
                  label="Zona di Appartenenza"
                  value={zona}
                  onChange={(e) => setZona(e.target.value)}
                  required
                  sx={{ flex: 1, minWidth: { md: 220 } }}
                >
                  {ZONE.map((z) => (
                    <MenuItem key={z} value={z}>
                      {z}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <TextField
                fullWidth
                label="Indirizzo di Residenza"
                placeholder="Via, Piazza, Numero Civico"
                value={indirizzo}
                onChange={(e) => setIndirizzo(e.target.value)}
              />
              <Stack direction={{ xs: "column", md: "row" }} sx={{ gap: 2.2 }}>
                <TextField
                  label="Numero componenti"
                  type="number"
                  value={numeroComponenti}
                  onChange={(e) => setNumeroComponenti(e.target.value)}
                  slotProps={{ htmlInput: { min: 0 } }}
                  sx={{ flex: 1, minWidth: { md: 220 } }}
                />
                <TextField
                  label="Codice Fiscale del tesserato"
                  value={cfTesserato}
                  onChange={(e) => setCfTesserato(e.target.value.toUpperCase())}
                  slotProps={{ htmlInput: { maxLength: 16 } }}
                  sx={{ flex: 1, minWidth: { md: 220 } }}
                />
                <TextField
                  label="Telefono"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  sx={{ flex: 1, minWidth: { md: 220 } }}
                />
                <TextField
                  select
                  label="Stato"
                  value={stato}
                  onChange={(e) => setStato(e.target.value as StatoNucleo)}
                  sx={{ flex: 1, minWidth: { md: 180 } }}
                >
                  {STATI.map((s) => (
                    <MenuItem key={s.value} value={s.value}>
                      {s.label}
                    </MenuItem>
                  ))}
                </TextField>
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
              gap: 1.5,
              flexWrap: "wrap",
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
                required
              />

              <Divider />

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ letterSpacing: 0.8, fontWeight: 700 }}
              >
                DATI CAPOFAMIGLIA
              </Typography>
              <SezionePersona
                value={stessoSoggetto ? capofamiglia : titolare}
                onChange={setTitolare}
                label=""
              />
              {stessoSoggetto && (
                <Typography variant="caption" color="text.secondary">
                  I dati sono sincronizzati con il titolare. Disattiva il toggle
                  sopra per modificarli separatamente.
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
              Aggiungi componente
            </Button>
          </Box>
          <Box sx={{ p: 3 }}>
            {componentiExtra.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                Nessun altro componente. Clicca "Aggiungi componente" per
                inserirne altri.
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
    </Box>
  );
}
