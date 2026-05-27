import { useEffect, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress,
  FormControl, Grid, InputLabel, MenuItem, Paper, Select,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import PrintIcon from '@mui/icons-material/Print'
import { supabase } from '@/api/supabase'
import StatusChip from '@/components/common/StatusChip'

// ── Types ───────────────────────────────────────────────────────────────────

type Componente = {
  id: string
  nucleo_id: string
  ruolo: string
  nome: string
  cognome: string
  codice_fiscale: string | null
  data_nascita: string | null
  nazionalita: string | null
  sesso: string | null
  paesi_terzi_ue: boolean | null
  invalido: boolean | null
  fascia_eta: string | null
}

type Iscrizione = {
  id: string
  numero_tessera: string
  data_inizio: string | null
  data_scadenza: string | null
}

type Nucleo = {
  id: string
  codice_fiscale: string | null
  zona: string
  stato: 'verde' | 'nero' | 'rosso'
  archiviato: boolean
  componenti: Componente[]
  iscrizioni: Iscrizione[]
}

type Articolo = {
  id: string
  nome: string
  unita_misura: string
  fondo: string
}

type MovimentoRaw = {
  articolo_id: string
  tipo: 'carico' | 'scarico'
  quantita_pezzi: number
}

type GiacenzaRow = Articolo & { giacenza: number }

type DistribuzioneRaw = {
  id: string
  centro: string
  data: string
  note: string | null
}

type IscrizioneRaw = {
  id: string
  numero_tessera: string
  data_inizio: string | null
  data_scadenza: string | null
  note: string | null
  created_at: string
}

type StoricoEvent = {
  tipo: 'iscrizione' | 'distribuzione'
  data: string
  descrizione: string
}

// ── Constants ───────────────────────────────────────────────────────────────

const ZONE = ['Pombio', 'Duomo', 'Medassino', 'San Rocco'] as const
const FONDI = ['FSE+', 'nazionale', 'cofinanziato']

const FASCIA_LABEL: Record<string, string> = {
  '0-17': '< 18 anni',
  '18-29': '18 – 29',
  '30-64': '30 – 64',
  '65+': '65+',
}
const FASCE_ORDINE = ['0-17', '18-29', '30-64', '65+']

// ── Utilities ────────────────────────────────────────────────────────────────

function getTitolare(componenti: Componente[]): Componente | undefined {
  return (
    componenti.find(c => c.ruolo === 'titolare') ??
    componenti.find(c => c.ruolo === 'capofamiglia')
  )
}

function getUltimaIscrizione(iscrizioni: Iscrizione[]): Iscrizione | undefined {
  return [...iscrizioni].sort((a, b) =>
    (b.data_inizio ?? '').localeCompare(a.data_inizio ?? '')
  )[0]
}

function calcFascia(dataNascita: string | null): string {
  if (!dataNascita) return '?'
  const anni = Math.floor(
    (Date.now() - new Date(dataNascita).getTime()) / (365.25 * 24 * 3600 * 1000)
  )
  if (anni < 18) return '0-17'
  if (anni < 30) return '18-29'
  if (anni < 65) return '30-64'
  return '65+'
}

function fmtData(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('it-IT')
}

function csvEscape(v: string | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Stampe() {
  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [nuclei, setNuclei] = useState<Nucleo[]>([])
  const [filterZona, setFilterZona] = useState<string>('Tutte')

  // Tab 3 — magazzino (lazy)
  const [giacenze, setGiacenze] = useState<GiacenzaRow[]>([])
  const [loadingMag, setLoadingMag] = useState(false)
  const [magLoaded, setMagLoaded] = useState(false)

  // Tab 4 — storico nucleo
  const [storicoNucleo, setStoricoNucleo] = useState<Nucleo | null>(null)
  const [storicoEvents, setStoricoEvents] = useState<StoricoEvent[]>([])
  const [loadingStorico, setLoadingStorico] = useState(false)

  // ── Carica nuclei all'avvio ───────────────────────────────────────────────
  useEffect(() => {
    async function carica() {
      setLoading(true)
      const { data, error } = await supabase
        .from('nuclei')
        .select(
          'id, codice_fiscale, zona, stato, archiviato, ' +
          'componenti(*), ' +
          'iscrizioni(id, numero_tessera, data_inizio, data_scadenza)'
        )
        .eq('archiviato', false)
        .order('zona')
      if (!error && data) setNuclei(data as unknown as Nucleo[])
      setLoading(false)
    }
    carica()
  }, [])

  // ── Carica magazzino al primo accesso al tab 3 ───────────────────────────
  useEffect(() => {
    if (tab !== 3 || magLoaded) return
    async function caricaMag() {
      setLoadingMag(true)
      const [{ data: articoli }, { data: movimenti }] = await Promise.all([
        supabase.from('articoli').select('id, nome, unita_misura, fondo'),
        supabase.from('movimenti_magazzino').select('articolo_id, tipo, quantita_pezzi'),
      ])
      if (articoli) {
        const movMap: Record<string, number> = {}
        ;(movimenti as MovimentoRaw[] | null ?? []).forEach(m => {
          movMap[m.articolo_id] = (movMap[m.articolo_id] ?? 0) +
            (m.tipo === 'carico' ? m.quantita_pezzi : -m.quantita_pezzi)
        })
        const rows: GiacenzaRow[] = (articoli as Articolo[]).map(a => ({
          ...a,
          giacenza: movMap[a.id] ?? 0,
        }))
        rows.sort((a, b) => a.fondo.localeCompare(b.fondo) || a.nome.localeCompare(b.nome))
        setGiacenze(rows)
      }
      setLoadingMag(false)
      setMagLoaded(true)
    }
    caricaMag()
  }, [tab, magLoaded])

  // ── Carica storico quando cambia nucleo selezionato ──────────────────────
  useEffect(() => {
    if (!storicoNucleo) { setStoricoEvents([]); return }
    async function caricaStorico() {
      setLoadingStorico(true)
      const [{ data: isc }, { data: dist }] = await Promise.all([
        supabase
          .from('iscrizioni')
          .select('id, numero_tessera, data_inizio, data_scadenza, note, created_at')
          .eq('nucleo_id', storicoNucleo.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('distribuzioni')
          .select('id, centro, data, note')
          .eq('nucleo_id', storicoNucleo.id)
          .order('data', { ascending: false }),
      ])
      const events: StoricoEvent[] = []
      ;(isc as IscrizioneRaw[] | null ?? []).forEach(i => {
        events.push({
          tipo: 'iscrizione',
          data: i.data_inizio ?? i.created_at,
          descrizione: `Tessera N° ${i.numero_tessera} — scad. ${fmtData(i.data_scadenza)}${i.note ? ` (${i.note})` : ''}`,
        })
      })
      ;(dist as DistribuzioneRaw[] | null ?? []).forEach(d => {
        events.push({
          tipo: 'distribuzione',
          data: d.data,
          descrizione: `Distribuzione — ${d.centro}${d.note ? ` — ${d.note}` : ''}`,
        })
      })
      events.sort((a, b) => b.data.localeCompare(a.data))
      setStoricoEvents(events)
      setLoadingStorico(false)
    }
    caricaStorico()
  }, [storicoNucleo])

  // ── Dati derivati (condivisi tra tab) ────────────────────────────────────

  const nucleiFiltrati = [...nuclei]
    .filter(n => filterZona === 'Tutte' || n.zona === filterZona)
    .sort((a, b) => {
      const ta = getTitolare(a.componenti)
      const tb = getTitolare(b.componenti)
      return (ta?.cognome ?? '').localeCompare(tb?.cognome ?? '', 'it')
    })

  const allComponenti = nuclei.flatMap(n => n.componenti)

  const fasciaCount: Record<string, number> = {}
  const nazCount: Record<string, number> = {}
  let invalidiCount = 0
  let paesiTerziCount = 0

  allComponenti.forEach(c => {
    const fascia = c.fascia_eta ?? calcFascia(c.data_nascita)
    fasciaCount[fascia] = (fasciaCount[fascia] ?? 0) + 1
    const naz = c.nazionalita ?? 'Non specificata'
    nazCount[naz] = (nazCount[naz] ?? 0) + 1
    if (c.invalido) invalidiCount++
    if (c.paesi_terzi_ue) paesiTerziCount++
  })

  const topNaz = Object.entries(nazCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const altreNaz =
    Object.values(nazCount).reduce((s, v) => s + v, 0) -
    topNaz.reduce((s, [, v]) => s + v, 0)

  // ── CSV Export ───────────────────────────────────────────────────────────

  function esportaCSV() {
    const header = [
      'cf_nucleo', 'zona', 'stato', 'numero_tessera', 'scadenza_tessera',
      'nome', 'cognome', 'data_nascita', 'fascia_eta', 'nazionalita',
      'sesso', 'invalido', 'paesi_terzi_ue', 'ruolo',
    ].join(',')

    const nucleiDaEsportare =
      filterZona === 'Tutte' ? nuclei : nuclei.filter(n => n.zona === filterZona)

    const rows = nucleiDaEsportare.flatMap(n => {
      const ultima = getUltimaIscrizione(n.iscrizioni)
      return n.componenti.map(c => [
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
        csvEscape(c.invalido != null ? (c.invalido ? 'SI' : 'NO') : null),
        csvEscape(c.paesi_terzi_ue != null ? (c.paesi_terzi_ue ? 'SI' : 'NO') : null),
        csvEscape(c.ruolo),
      ].join(','))
    })

    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nuclei_fse_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }} className="no-print">
        <PrintIcon color="primary" />
        <Typography variant="h5">Stampe e Reportistica</Typography>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }} className="no-print">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab label="Lista Nuclei" />
          <Tab label="Report FSE+" />
          <Tab label="Esporta CSV" />
          <Tab label="Magazzino" />
          <Tab label="Storico Nucleo" />
        </Tabs>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
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
                sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}
              >
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Zona</InputLabel>
                  <Select
                    value={filterZona}
                    label="Zona"
                    onChange={e => setFilterZona(e.target.value)}
                  >
                    <MenuItem value="Tutte">Tutte</MenuItem>
                    {ZONE.map(z => <MenuItem key={z} value={z}>{z}</MenuItem>)}
                  </Select>
                </FormControl>
                <Typography variant="body2" color="text.secondary">
                  {nucleiFiltrati.length} nuclei
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
                  Stampa
                </Button>
              </Box>

              {/* Titolo visibile solo in stampa */}
              <Typography
                variant="h6"
                sx={{ mb: 2, display: 'none', '@media print': { display: 'block' } }}
              >
                Lista Nuclei{filterZona !== 'Tutte' ? ` — Zona ${filterZona}` : ''} —{' '}
                {new Date().toLocaleDateString('it-IT')}
              </Typography>

              <TableContainer component={Paper} elevation={1}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'primary.main' }}>
                      {['N° Tessera', 'Codice Fiscale', 'Nominativo', 'Zona', 'Stato', 'Scadenza'].map(h => (
                        <TableCell key={h} sx={{ color: 'white', fontWeight: 700 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {nucleiFiltrati.map((n, i) => {
                      const titolare = getTitolare(n.componenti)
                      const ultima = getUltimaIscrizione(n.iscrizioni)
                      return (
                        <TableRow
                          key={n.id}
                          sx={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'action.hover' }}
                        >
                          <TableCell>{ultima?.numero_tessera ?? '—'}</TableCell>
                          <TableCell>{n.codice_fiscale ?? '—'}</TableCell>
                          <TableCell>
                            {titolare ? `${titolare.cognome} ${titolare.nome}` : '—'}
                          </TableCell>
                          <TableCell>{n.zona}</TableCell>
                          <TableCell><StatusChip stato={n.stato} /></TableCell>
                          <TableCell>{fmtData(ultima?.data_scadenza)}</TableCell>
                        </TableRow>
                      )
                    })}
                    {nucleiFiltrati.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          Nessun nucleo trovato
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* ═══════════════ TAB 1 — Report FSE+ ═══════════════ */}
          {tab === 1 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }} className="no-print">
                <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
                  Stampa Report
                </Button>
              </Box>

              <Typography
                variant="h6"
                sx={{ mb: 2, display: 'none', '@media print': { display: 'block' } }}
              >
                Report FSE+ / FEAD — {new Date().toLocaleDateString('it-IT')}
              </Typography>

              {/* Stat cards */}
              <Grid container spacing={2} sx={{ mb: 4 }}>
                {[
                  { label: 'Nuclei attivi', value: nuclei.length, color: 'primary.main' },
                  { label: 'Componenti totali', value: allComponenti.length, color: 'primary.main' },
                  { label: 'Con disabilità', value: invalidiCount, color: 'warning.main' },
                  { label: 'Paesi terzi UE', value: paesiTerziCount, color: 'info.main' },
                ].map(s => (
                  <Grid size={{ xs: 6, sm: 3 }} key={s.label}>
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h4" sx={{ fontWeight: 700, color: s.color }}>
                        {s.value}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">{s.label}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              <Grid container spacing={3}>
                {/* Fasce età */}
                <Grid size={{ xs: 12, md: 6 }}>
                  <Paper elevation={1} sx={{ p: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                      Fasce di età
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Fascia</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>N° persone</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>%</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {FASCE_ORDINE.map(f => {
                          const count = fasciaCount[f] ?? 0
                          const pct = allComponenti.length > 0
                            ? ((count / allComponenti.length) * 100).toFixed(1)
                            : '0.0'
                          return (
                            <TableRow key={f}>
                              <TableCell>{FASCIA_LABEL[f]}</TableCell>
                              <TableCell align="right">{count}</TableCell>
                              <TableCell align="right">{pct}%</TableCell>
                            </TableRow>
                          )
                        })}
                        {(fasciaCount['?'] ?? 0) > 0 && (
                          <TableRow>
                            <TableCell sx={{ color: 'text.secondary' }}>Non disponibile</TableCell>
                            <TableCell align="right">{fasciaCount['?']}</TableCell>
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
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                      Nazionalità (top 5)
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Paese</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>N° persone</TableCell>
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
                            <TableCell sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
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
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                      Distribuzione per zona
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          {['Zona', 'Nuclei', 'Componenti', 'Disabili', 'Paesi terzi'].map(h => (
                            <TableCell
                              key={h}
                              align={h === 'Zona' ? 'left' : 'right'}
                              sx={{ fontWeight: 700 }}
                            >
                              {h}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {ZONE.map(z => {
                          const nz = nuclei.filter(n => n.zona === z)
                          const cz = nz.flatMap(n => n.componenti)
                          return (
                            <TableRow key={z}>
                              <TableCell>{z}</TableCell>
                              <TableCell align="right">{nz.length}</TableCell>
                              <TableCell align="right">{cz.length}</TableCell>
                              <TableCell align="right">{cz.filter(c => c.invalido).length}</TableCell>
                              <TableCell align="right">{cz.filter(c => c.paesi_terzi_ue).length}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* ═══════════════ TAB 2 — Esporta CSV ═══════════════ */}
          {tab === 2 && (
            <Box>
              <Paper elevation={1} sx={{ p: 3, maxWidth: 600 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Esportazione CSV per FSE+ / Ospo
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Genera un file CSV UTF-8 con i dati di tutti i componenti.
                  Una riga per componente, inclusi tutti i campi richiesti per la rendicontazione FSE+.
                </Typography>

                <FormControl size="small" fullWidth sx={{ mb: 3 }}>
                  <InputLabel>Filtra per zona</InputLabel>
                  <Select
                    value={filterZona}
                    label="Filtra per zona"
                    onChange={e => setFilterZona(e.target.value)}
                  >
                    <MenuItem value="Tutte">Tutte le zone</MenuItem>
                    {ZONE.map(z => <MenuItem key={z} value={z}>{z}</MenuItem>)}
                  </Select>
                </FormControl>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Campi inclusi:</strong> CF nucleo · zona · stato · n° tessera · scadenza ·
                  nome · cognome · data nascita · fascia età · nazionalità · sesso · invalido ·
                  paesi terzi UE · ruolo
                </Typography>

                <Typography variant="body2" sx={{ mb: 3 }}>
                  <strong>Righe da esportare:</strong>{' '}
                  {(filterZona === 'Tutte' ? nuclei : nuclei.filter(n => n.zona === filterZona))
                    .flatMap(n => n.componenti).length}{' '}
                  componenti ({filterZona === 'Tutte'
                    ? nuclei.length
                    : nuclei.filter(n => n.zona === filterZona).length}{' '}
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

          {/* ═══════════════ TAB 3 — Magazzino ═══════════════ */}
          {tab === 3 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }} className="no-print">
                <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()}>
                  Stampa
                </Button>
              </Box>

              <Typography
                variant="h6"
                sx={{ mb: 2, display: 'none', '@media print': { display: 'block' } }}
              >
                Riepilogo Magazzino — {new Date().toLocaleDateString('it-IT')}
              </Typography>

              {loadingMag ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                  <CircularProgress />
                </Box>
              ) : giacenze.length === 0 ? (
                <Alert severity="info">
                  Nessun articolo in magazzino. Il modulo Magazzino (Fase 5) non è ancora stato
                  configurato.
                </Alert>
              ) : (
                FONDI.map(fondo => {
                  const righe = giacenze.filter(g => g.fondo === fondo)
                  if (righe.length === 0) return null
                  return (
                    <Box key={fondo} sx={{ mb: 4 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                        Fondo: {fondo}
                      </Typography>
                      <TableContainer component={Paper} elevation={1}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ backgroundColor: 'grey.100' }}>
                              <TableCell sx={{ fontWeight: 700 }}>Articolo</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>Unità</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>Giacenza</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {righe.map(r => (
                              <TableRow
                                key={r.id}
                                sx={{
                                  backgroundColor: r.giacenza < 0
                                    ? 'rgba(198,40,40,0.06)'
                                    : 'transparent',
                                }}
                              >
                                <TableCell>{r.nome}</TableCell>
                                <TableCell>{r.unita_misura}</TableCell>
                                <TableCell
                                  align="right"
                                  sx={{
                                    fontWeight: 600,
                                    color: r.giacenza < 0 ? 'error.main' : 'inherit',
                                  }}
                                >
                                  {r.giacenza}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )
                })
              )}
            </Box>
          )}

          {/* ═══════════════ TAB 4 — Storico Nucleo ═══════════════ */}
          {tab === 4 && (
            <Box>
              <Box sx={{ mb: 3 }} className="no-print">
                <Autocomplete
                  options={nuclei}
                  getOptionLabel={n => {
                    const t = getTitolare(n.componenti)
                    const nome = t ? `${t.cognome} ${t.nome}` : (n.codice_fiscale ?? n.id)
                    const ultima = getUltimaIscrizione(n.iscrizioni)
                    return `${nome}${ultima ? ` — tessera ${ultima.numero_tessera}` : ''} (${n.zona})`
                  }}
                  value={storicoNucleo}
                  onChange={(_, v) => setStoricoNucleo(v)}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderInput={params => (
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
                <Alert severity="info">Seleziona un nucleo per visualizzarne lo storico.</Alert>
              )}

              {storicoNucleo && loadingStorico && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                  <CircularProgress />
                </Box>
              )}

              {storicoNucleo && !loadingStorico && (
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                    Storico —{' '}
                    {(() => {
                      const t = getTitolare(storicoNucleo.componenti)
                      return t ? `${t.cognome} ${t.nome}` : storicoNucleo.codice_fiscale
                    })()}
                    {' '}({storicoNucleo.zona})
                  </Typography>

                  {storicoEvents.length === 0 ? (
                    <Alert severity="info">Nessun evento registrato per questo nucleo.</Alert>
                  ) : (
                    <TableContainer component={Paper} elevation={1}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: 'grey.100' }}>
                            <TableCell sx={{ fontWeight: 700 }}>Data</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tipo</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Dettaglio</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {storicoEvents.map((ev, i) => (
                            <TableRow
                              key={i}
                              sx={{
                                backgroundColor: ev.tipo === 'iscrizione'
                                  ? 'rgba(25,118,210,0.05)'
                                  : 'transparent',
                              }}
                            >
                              <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtData(ev.data)}</TableCell>
                              <TableCell>
                                <Chip
                                  label={ev.tipo === 'iscrizione' ? 'Iscrizione' : 'Distribuzione'}
                                  size="small"
                                  color={ev.tipo === 'iscrizione' ? 'primary' : 'success'}
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
    </Box>
  )
}
