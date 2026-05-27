import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import HistoryIcon from '@mui/icons-material/History'
import { supabase } from '@/api/supabase'

type DistribuzioneRiga = {
  id: string
  data: string
  centro: string
  note: string | null
  created_at: string
}

type Props = {
  /** ID nucleo da caricare. Dialog aperta se non null. */
  nucleoId: string | null
  /** Etichetta opzionale mostrata nel titolo */
  nucleoLabel?: string
  onClose: () => void
}

export default function StoricoDistribuzioniDialog({ nucleoId, nucleoLabel, onClose }: Props) {
  const [righe, setRighe] = useState<DistribuzioneRiga[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!nucleoId) return
    setLoading(true)
    setRighe([])
    supabase
      .from('distribuzioni')
      .select('id, data, centro, note, created_at')
      .eq('nucleo_id', nucleoId)
      .order('data', { ascending: false })
      .then(({ data }) => {
        setRighe(data ?? [])
        setLoading(false)
      })
  }, [nucleoId])

  return (
    <Dialog open={Boolean(nucleoId)} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Storico Distribuzioni{nucleoLabel ? ` — ${nucleoLabel}` : ''}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : righe.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            Nessuna distribuzione registrata per questo nucleo.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                {['Data', 'Centro', 'Nota', 'Registrata il'].map((h) => (
                  <TableCell
                    key={h}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: 'text.secondary',
                    }}
                  >
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {righe.map((r, i) => (
                <TableRow key={r.id} sx={i === 0 ? { bgcolor: 'rgba(25,118,210,0.06)' } : {}}>
                  <TableCell sx={{ fontWeight: i === 0 ? 700 : 400 }}>
                    {new Date(r.data).toLocaleDateString('it-IT')}
                  </TableCell>
                  <TableCell>{r.centro}</TableCell>
                  <TableCell>{r.note ?? '—'}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                    {new Date(r.created_at).toLocaleDateString('it-IT')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Chiudi</Button>
      </DialogActions>
    </Dialog>
  )
}
