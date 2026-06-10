import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import SearchIcon from "@mui/icons-material/Search";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import NoteIcon from "@mui/icons-material/Note";
import NoteOutlinedIcon from "@mui/icons-material/NoteOutlined";
import UndoIcon from "@mui/icons-material/Undo";
import HistoryIcon from "@mui/icons-material/History";
import type { StatoNucleo } from "@/hooks/useDistribuzione";
import { ZONE_DISTRIBUZIONE, useDistribuzione } from "@/hooks/useDistribuzione";
import { useAuth } from "@/hooks/useAuth";
import StoricoDistribuzioniDialog from "@/components/common/StoricoDistribuzioniDialog";

const STATO_FILTER: Array<{ value: StatoNucleo | ""; label: string }> = [
  { value: "", label: "Tutti gli stati" },
  { value: "bozza", label: "Bozza" },
  { value: "verde", label: "Attivo" },
  { value: "nero", label: "Non rinnovato" },
  { value: "rosso", label: "Sospeso" },
];

type PendingUndo = {
  open: boolean;
  distribuzioneId: string;
  nucleoId: string;
};

type NotaDialogState = {
  open: boolean;
  distribuzioneId: string;
  nucleoId: string;
  note: string;
};

type SbloccoDialogState = {
  open: boolean;
  distribuzioneId: string;
  nucleoId: string;
  label: string;
};

function renderStato(stato: StatoNucleo) {
  if (stato === "bozza") return { label: "Bozza", color: "default" as const };
  if (stato === "verde") return { label: "Attivo", color: "success" as const };
  if (stato === "nero")
    return { label: "Non rinnovato", color: "warning" as const };
  return { label: "Sospeso", color: "error" as const };
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("it-IT");
}

export default function Distribuzione() {
  const { user } = useAuth();
  const {
    centro,
    setCentro,
    dataDistribuzione,
    setDataDistribuzione,
    statoFilter,
    setStatoFilter,
    search,
    setSearch,
    rows,
    totalRows,
    loading,
    error,
    setError,
    savingId,
    load,
    registerConsegna,
    undoConsegna,
    saveNotaConsegna,
  } = useDistribuzione();

  const [successMsg, setSuccessMsg] = useState("");
  const [numeroPacchiMap, setNumeroPacchiMap] = useState<
    Record<string, string>
  >({});
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [notaDialog, setNotaDialog] = useState<NotaDialogState | null>(null);
  const [sbloccoDialog, setSbloccoDialog] = useState<SbloccoDialogState | null>(
    null,
  );
  const [storicoDistNucleoId, setStoricoDistNucleoId] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!centro) return;
    load();
  }, [centro, load]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const handleRegister = async (nucleoId: string) => {
    const numeroPacchiStr = numeroPacchiMap[nucleoId] ?? "";
    const numeroPacchi =
      numeroPacchiStr !== "" ? parseInt(numeroPacchiStr, 10) : null;
    const result = await registerConsegna(nucleoId, user?.id, numeroPacchi);
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setNumeroPacchiMap((prev) => {
      const next = { ...prev };
      delete next[nucleoId];
      return next;
    });

    setSuccessMsg("Consegna registrata. Puoi annullare entro 5 secondi.");
    setPendingUndo({
      open: true,
      distribuzioneId: result.data.distribuzioneId,
      nucleoId: result.data.nucleoId,
    });

    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
    }
    undoTimeoutRef.current = window.setTimeout(() => {
      setPendingUndo((current) =>
        current ? { ...current, open: false } : null,
      );
      undoTimeoutRef.current = null;
    }, 5000);
  };

  const handleUndo = async () => {
    if (!pendingUndo) return;
    const result = await undoConsegna(
      pendingUndo.distribuzioneId,
      pendingUndo.nucleoId,
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    setPendingUndo(null);
    setSuccessMsg("Registrazione annullata.");
  };

  const handleOpenNota = (
    nucleoId: string,
    distribuzioneId: string | null,
    currentNote: string | null,
  ) => {
    if (!distribuzioneId) {
      setError("Registra prima la consegna per la data selezionata.");
      return;
    }

    setNotaDialog({
      open: true,
      distribuzioneId,
      nucleoId,
      note: currentNote ?? "",
    });
  };

  const handleSaveNota = async () => {
    if (!notaDialog) return;

    const result = await saveNotaConsegna(
      notaDialog.distribuzioneId,
      notaDialog.nucleoId,
      notaDialog.note,
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setNotaDialog(null);
    setSuccessMsg("Nota salvata con successo.");
  };

  const handleOpenSblocco = (
    distribuzioneId: string,
    nucleoId: string,
    label: string,
  ) => {
    setSbloccoDialog({
      open: true,
      distribuzioneId,
      nucleoId,
      label,
    });
  };

  const handleConfermaSblocco = async () => {
    if (!sbloccoDialog) return;

    const result = await undoConsegna(
      sbloccoDialog.distribuzioneId,
      sbloccoDialog.nucleoId,
    );
    if (!result.ok) {
      setError(result.message);
      return;
    }

    setSbloccoDialog(null);
    setSuccessMsg("Sblocco completato: ultima distribuzione rimossa.");
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <LocalShippingIcon color="primary" />
        <Typography variant="h5">Distribuzione</Typography>
      </Box>

      <Typography color="text.secondary" sx={{ mb: 2.5 }}>
        Elenco rapido per registrare consegne in tempo reale senza sotto-menu.
      </Typography>

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

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            alignItems: { xs: "stretch", md: "flex-start" },
            justifyContent: { md: "space-between" },
            gap: 1.5,
          }}
        >
          <Box sx={{ width: { xs: "100%", md: 220 }, flexShrink: 0 }}>
            <TextField
              label="Data distribuzione"
              type="date"
              size="small"
              value={dataDistribuzione}
              onChange={(event) => setDataDistribuzione(event.target.value)}
              slotProps={{
                inputLabel: { shrink: true },
              }}
              fullWidth
            />
          </Box>

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.2}
            sx={{
              width: { xs: "100%", md: "auto" },
              ml: { md: "auto" },
            }}
          >
            <TextField
              label="Centro"
              size="small"
              value={centro}
              onChange={(event) =>
                setCentro(
                  event.target.value as (typeof ZONE_DISTRIBUZIONE)[number],
                )
              }
              select
              fullWidth
              sx={{ width: { xs: "100%", md: 170 } }}
            >
              {ZONE_DISTRIBUZIONE.map((item) => (
                <MenuItem key={item} value={item}>
                  {item}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Stato"
              size="small"
              value={statoFilter}
              onChange={(event) =>
                setStatoFilter(event.target.value as StatoNucleo | "")
              }
              select
              fullWidth
              sx={{ width: { xs: "100%", md: 170 } }}
            >
              {STATO_FILTER.map((item) => (
                <MenuItem key={item.label} value={item.value}>
                  {item.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Ricerca"
              size="small"
              placeholder="CF, tessera, tesserato o capofamiglia"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              fullWidth
              sx={{ width: { xs: "100%", md: 300 } }}
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
          </Stack>
        </Box>
      </Paper>

      {!centro && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Seleziona un centro per caricare l'elenco famiglie.
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Tesserato</TableCell>
              <TableCell>CF</TableCell>
              <TableCell>Tessera</TableCell>
              <TableCell>Stato</TableCell>
              <TableCell>Ultima distribuzione</TableCell>
              <TableCell sx={{ width: 90 }}>Pacchi</TableCell>
              <TableCell align="center">Nota / Storico</TableCell>
              <TableCell align="right">Azione</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Box
                    sx={{ display: "flex", justifyContent: "center", py: 3 }}
                  >
                    <CircularProgress size={26} />
                  </Box>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography color="text.secondary" sx={{ py: 1 }}>
                    {centro
                      ? "Nessun nucleo trovato con i filtri selezionati."
                      : "Nessun dato da mostrare."}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const stato = renderStato(row.stato);
                const isSaving = savingId === row.nucleoId;
                const disabled = isSaving || row.giaServitoSettimana;
                const pacchiValue =
                  numeroPacchiMap[row.nucleoId] ??
                  (row.numeroPacchi != null
                    ? String(row.numeroPacchi)
                    : row.numeroComponenti != null
                      ? String(row.numeroComponenti)
                      : "");
                const canUndoRow = Boolean(
                  pendingUndo?.open && pendingUndo.nucleoId === row.nucleoId,
                );
                const canSbloccaRow = Boolean(
                  row.giaServitoSettimana && row.distribuzioneSelezionataId,
                );

                return (
                  <TableRow key={row.nucleoId} hover>
                    <TableCell>
                      <Stack direction="column" spacing={0.3}>
                        <Typography sx={{ fontWeight: 700 }}>
                          {row.cognomeTesserato} {row.nomeTesserato}
                        </Typography>
                        {row.capofamigliaDiverso && (
                          <Typography variant="caption" color="text.secondary">
                            Capofamiglia: {row.cognomeCapofamiglia}{" "}
                            {row.nomeCapofamiglia}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>{row.codiceFiscale || "—"}</TableCell>
                    <TableCell>
                      <Stack direction="column" spacing={0.4}>
                        <Typography variant="body2">
                          {row.numeroTessera || "—"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Scad. {formatDate(row.scadenzaTessera)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={stato.label}
                        color={stato.color}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {row.giaServitoSettimana ? (
                        <Stack
                          direction="row"
                          spacing={0.6}
                          sx={{ alignItems: "center" }}
                        >
                          <EventBusyIcon color="error" sx={{ fontSize: 16 }} />
                          <Typography
                            variant="body2"
                            color="error.main"
                            sx={{ fontWeight: 700 }}
                          >
                            Registrato il {formatDate(row.ultimaDistribuzione)}
                          </Typography>
                        </Stack>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(row.ultimaDistribuzione)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.giaServitoSettimana ? (
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, textAlign: "center" }}
                        >
                          {row.numeroPacchi != null ? row.numeroPacchi : "—"}
                        </Typography>
                      ) : (
                        <TextField
                          type="number"
                          size="small"
                          value={pacchiValue}
                          onChange={(e) =>
                            setNumeroPacchiMap((prev) => ({
                              ...prev,
                              [row.nucleoId]: e.target.value,
                            }))
                          }
                          slotProps={{ htmlInput: { min: 0 } }}
                          sx={{ width: 80 }}
                          disabled={isSaving}
                        />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip
                        title={
                          row.haNotaDistribuzione
                            ? "Modifica nota"
                            : "Aggiungi nota"
                        }
                      >
                        <span>
                          <IconButton
                            size="small"
                            onClick={() =>
                              handleOpenNota(
                                row.nucleoId,
                                row.distribuzioneSelezionataId,
                                row.notaDistribuzione,
                              )
                            }
                            disabled={isSaving}
                            color={
                              row.haNotaDistribuzione ? "primary" : "default"
                            }
                          >
                            {row.haNotaDistribuzione ? (
                              <NoteIcon fontSize="small" />
                            ) : (
                              <NoteOutlinedIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Storico distribuzioni">
                        <IconButton
                          size="small"
                          onClick={() =>
                            setStoricoDistNucleoId({
                              id: row.nucleoId,
                              label:
                                `${row.cognomeTesserato} ${row.nomeTesserato}`.trim(),
                            })
                          }
                        >
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      {canUndoRow ? (
                        <Button
                          variant="outlined"
                          color="warning"
                          size="small"
                          onClick={handleUndo}
                          startIcon={<UndoIcon />}
                        >
                          Annulla
                        </Button>
                      ) : canSbloccaRow ? (
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() =>
                            handleOpenSblocco(
                              row.distribuzioneSelezionataId as string,
                              row.nucleoId,
                              `${row.cognomeTesserato} ${row.nomeTesserato}`,
                            )
                          }
                          disabled={isSaving}
                        >
                          Sblocca
                        </Button>
                      ) : row.giaServitoSettimana ? (
                        <Button
                          variant="outlined"
                          color="inherit"
                          size="small"
                          disabled
                        >
                          Bloccato
                        </Button>
                      ) : (
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          onClick={() => handleRegister(row.nucleoId)}
                          disabled={disabled}
                          startIcon={
                            isSaving ? (
                              <CircularProgress size={14} color="inherit" />
                            ) : (
                              <CheckCircleIcon />
                            )
                          }
                        >
                          Registra
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography color="text.secondary" sx={{ mt: 1.25 }}>
        Risultati: {rows.length} / {totalRows}
      </Typography>

      <Snackbar
        open={Boolean(pendingUndo?.open)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        onClose={() =>
          setPendingUndo((current) =>
            current ? { ...current, open: false } : null,
          )
        }
        message="Consegna registrata"
        action={
          <Button size="small" color="secondary" onClick={handleUndo}>
            Annulla
          </Button>
        }
      />

      <Dialog
        open={Boolean(notaDialog?.open)}
        onClose={() => setNotaDialog(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Nota distribuzione</DialogTitle>
        <DialogContent>
          <TextField
            label="Nota"
            value={notaDialog?.note ?? ""}
            onChange={(event) =>
              setNotaDialog((current) =>
                current
                  ? {
                      ...current,
                      note: event.target.value,
                    }
                  : current,
              )
            }
            fullWidth
            multiline
            minRows={4}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNotaDialog(null)}>Chiudi</Button>
          <Button
            variant="contained"
            onClick={handleSaveNota}
            disabled={!notaDialog || savingId === notaDialog.nucleoId}
          >
            Salva nota
          </Button>
        </DialogActions>
      </Dialog>

      <StoricoDistribuzioniDialog
        nucleoId={storicoDistNucleoId?.id ?? null}
        nucleoLabel={storicoDistNucleoId?.label}
        onClose={() => setStoricoDistNucleoId(null)}
        onChanged={() => load()}
      />

      <Dialog
        open={Boolean(sbloccoDialog?.open)}
        onClose={() => setSbloccoDialog(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Conferma sblocco</DialogTitle>
        <DialogContent>
          <Typography>Sei sicuro di sbloccarlo?</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Verrà cancellata l'ultima distribuzione di {sbloccoDialog?.label} e
            il nucleo tornerà allo stato precedente.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSbloccoDialog(null)}>Annulla</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfermaSblocco}
            disabled={!sbloccoDialog || savingId === sbloccoDialog.nucleoId}
          >
            Conferma sblocco
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
