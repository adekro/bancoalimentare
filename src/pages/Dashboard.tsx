import { useEffect, useState } from 'react'
import { Box, Typography, Grid, Paper, CircularProgress } from '@mui/material'
import PeopleIcon from '@mui/icons-material/People'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { supabase } from '@/api/supabase'

// ---- Colori ----
const COLOR_ZONE: Record<string, string> = {
  Duomo: '#1a6e3c',
  'San Rocco': '#4caf50',
  Medassino: '#e65100',
  Pombio: '#ff8a50',
}
const COLOR_ETA = ['#1a6e3c', '#4caf50', '#e65100', '#ff8a50']
const COLOR_TESS = ['#1a6e3c', '#c62828']

// ---- Tipi ----
type FasciaEtaRow = { name: string; valore: number }
type ZonaRow = { name: string; valore: number }
type TesseraRow = { name: string; valore: number }

const FASCIA_LABEL: Record<string, string> = {
  '0-17': '< 18 anni',
  '18-29': '18 – 29',
  '30-64': '30 – 64',
  '65+': '65+',
}
const FASCIA_ORDER = ['0-17', '18-29', '30-64', '65+']

// ---- Componente etichetta personalizzata per PieChart ----
const RADIAN = Math.PI / 180
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number
  innerRadius: number; outerRadius: number; percent: number
}) {
  if (percent < 0.04) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      fontSize={13} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export default function Dashboard() {
  const [nucleiCount, setNucleiCount] = useState<number | null>(null)
  const [distCount, setDistCount] = useState<number | null>(null)
  const [tesseraStats, setTesseraStats] = useState<TesseraRow[]>([])
  const [fasciaEta, setFasciaEta] = useState<FasciaEtaRow[]>([])
  const [zone, setZone] = useState<ZonaRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carica() {
      // Nuclei attivi
      const { count: nCount } = await supabase
        .from('nuclei')
        .select('*', { count: 'exact', head: true })
        .eq('archiviato', false)

      // Distribuzioni settimana corrente
      const oggi = new Date()
      const lunedi = new Date(oggi)
      lunedi.setDate(oggi.getDate() - ((oggi.getDay() + 6) % 7))
      const { count: dCount } = await supabase
        .from('distribuzioni')
        .select('*', { count: 'exact', head: true })
        .gte('data', lunedi.toISOString().slice(0, 10))

      // Fascia età (componenti di nuclei attivi)
      const { data: compRows } = await supabase
        .from('componenti')
        .select('fascia_eta, nuclei!inner(archiviato)')
        .eq('nuclei.archiviato', false)

      const fasciaCounts: Record<string, number> = { '0-17': 0, '18-29': 0, '30-64': 0, '65+': 0 }
      compRows?.forEach((c: { fascia_eta: string | null }) => {
        if (c.fascia_eta && fasciaCounts[c.fascia_eta] !== undefined) {
          fasciaCounts[c.fascia_eta]++
        }
      })
      const fasciaData = FASCIA_ORDER
        .map((k) => ({ name: FASCIA_LABEL[k], valore: fasciaCounts[k] }))
        .filter((r) => r.valore > 0)

      // Zone (nuclei attivi)
      const { data: nucleiRows } = await supabase
        .from('nuclei')
        .select('zona')
        .eq('archiviato', false)

      const zonaCounts: Record<string, number> = {}
      nucleiRows?.forEach((n: { zona: string }) => {
        zonaCounts[n.zona] = (zonaCounts[n.zona] ?? 0) + 1
      })
      const zonaData = Object.entries(zonaCounts).map(([name, valore]) => ({ name, valore }))

      // Tessere: iscrizioni valide vs scadute
      const oggi = new Date().toISOString().slice(0, 10)
      const { data: iscrRows } = await supabase
        .from('iscrizioni')
        .select('data_scadenza')

      let valide = 0
      let scadute = 0
      iscrRows?.forEach((t: { data_scadenza: string | null }) => {
        if (t.data_scadenza && t.data_scadenza >= oggi) valide++
        else scadute++
      })
      const tessData: TesseraRow[] = [
        { name: 'Valide', valore: valide },
        { name: 'Scadute', valore: scadute },
      ].filter((r) => r.valore > 0)

      setNucleiCount(nCount ?? 0)
      setDistCount(dCount ?? 0)
      setFasciaEta(fasciaData)
      setZone(zonaData)
      setTesseraStats(tessData)
      setLoading(false)
    }
    carica()
  }, [])

  const tessereTotal = tesseraStats.reduce((s, r) => s + r.valore, 0)

  const statCards = [
    {
      label: 'Nuclei attivi',
      value: nucleiCount !== null ? String(nucleiCount) : '…',
      icon: <PeopleIcon fontSize="large" color="primary" />,
    },
    {
      label: 'Distribuzioni questa settimana',
      value: distCount !== null ? String(distCount) : '…',
      icon: <LocalShippingIcon fontSize="large" color="secondary" />,
    },
    {
      label: 'Tessere totali',
      value: loading ? '…' : String(tessereTotal),
      icon: <AssignmentTurnedInIcon fontSize="large" color="primary" />,
    },
  ]

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Dashboard</Typography>
      <Typography variant="body1" color="text.secondary" mb={3}>
        Benvenuto nel gestionale del Banco Alimentare.
      </Typography>

      {/* ---- Stat cards ---- */}
      <Grid container spacing={3} mb={4}>
        {statCards.map((s) => (
          <Grid item xs={12} sm={6} md={4} key={s.label}>
            <Paper sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
              {s.icon}
              <Box>
                <Typography variant="h4" fontWeight={700}>{s.value}</Typography>
                <Typography variant="body2" color="text.secondary">{s.label}</Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>

          {/* ---- Fasce di età ---- */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Componenti per fascia d'età</Typography>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={fasciaEta} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => [v, 'Componenti']} />
                  <Bar dataKey="valore" name="Componenti" radius={[4, 4, 0, 0]}>
                    {fasciaEta.map((_, i) => (
                      <Cell key={i} fill={COLOR_ETA[i % COLOR_ETA.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* ---- Zone ---- */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Nuclei per zona</Typography>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={zone}
                    dataKey="valore"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    labelLine={false}
                    label={PieLabel as React.FC}
                  >
                    {zone.map((entry) => (
                      <Cell key={entry.name} fill={COLOR_ZONE[entry.name] ?? '#888'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          {/* ---- Tessere rinnovate ---- */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Tessere: valide vs scadute</Typography>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={tesseraStats}
                    dataKey="valore"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    labelLine={false}
                    label={PieLabel as React.FC}
                  >
                    {tesseraStats.map((_, i) => (
                      <Cell key={i} fill={COLOR_TESS[i % COLOR_TESS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

        </Grid>
      )}
    </Box>
  )
}

