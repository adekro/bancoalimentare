import { useCallback, useEffect, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Alert,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import HistoryIcon from '@mui/icons-material/History'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import SaveIcon from '@mui/icons-material/Save'
import CloseIcon from '@mui/icons-material/Close'
import { supabase } from '@/api/supabase'

type DistribuzioneRiga = {
  id: string
  data: string
  centro: string
  note: string | null
  numero_pacchi: number | null
  created_at: string
}

type EditState = {
  id: string
  note: string
  numero_pacchi: number | ''
}

type Props = {
  /** ID nucleo da caricare. Dialog aperta se non null. */
  nucleoId: string | null
  /** Etichetta opzionale mostrata nel titolo */
  nucleoLabel?: string
  onClose: () => void
  /** Chiamata dopo ogni modifica o eliminazione */
  onChanged?: () => void
}

export default function StoricoDistribuzioniDialog({ nucleoId, nucleoLabel, onClose, onChanged }: Props) {
  const [righe, setRighe] = useState<DistribuzioneRiga[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const fetchRighe = useCallback(async (nId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('distribuzioni')
      .select('id, data, centro, note, numero_pacchi, created_at')
      .eq('nucleo_id', nId)
      .order('data', { ascending: false })
    setRighe(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!nucleoId) return
    setRighe([])
    setEditState(null)
    setDeleteId(null)
    setDeleteError('')
    fetchRighe(nucleoId)
  }, [nucleoId, fetchRighe])

  const handleStartEdit = (r: DistribuzioneRiga) => {
    setEditState({
      id: r.id,
      note: r.note ?? '',
      numero_pacchi: r.numero_pacchi ?? '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editState || !nucleoId) return
    setSaving(true)
    const { error } = await supabase
      .from('distribuzioni')
      .update({
        note: editState.note.trim() || null,
        numero_pacchi: editState.numero_pacchi === '' ? null : Number(editState.numero_pacchi),
      })
      .eq('id', editState.id)
    setSaving(false)
    if (!error) {
      setEditState(null)
      await fetchRighe(nucleoId)
      onChanged?.()
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteId || !nucleoId) return
    setSaving(true)
    setDeleteError('')
    const { data, error } = await supabase
      .from('distribuzioni')
      .delete()
      .eq('id', deleteId)
      .select('id')
    setSaving(false)
    if (error) {
      setDeleteError(error.message)
      return
    }

    if (!data?.length) {
      setDeleteError('La registrazione non è stata eliminata dal database.')
      return
    }

    setDeleteId(null)
    await fetchRighe(nucleoId)
    onChanged?.()
  }

  const deleteTarget = deleteId ? righe.find((r) => r.id === deleteId) : null

  return (
    <>
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
                  {['Data', 'Centro', 'Pacchi', 'Nota', 'Registrata il', ''].map((h) => (
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
                {righe.map((r, i) => {
                  const isEditing = editState?.id === r.id
                  return (
                    <TableRow key={r.id} sx={i === 0 ? { bgcolor: 'rgba(25,118,210,0.06)' } : {}}>
                      <TableCell sx={{ fontWeight: i === 0 ? 700 : 400 }}>
                        {new Date(r.data).toLocaleDateString('it-IT')}
                      </TableCell>
                      <TableCell>{r.centro}</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <TextField
                            type="number"
                            size="small"
                            value={editState.numero_pacchi}
                            onChange={(e) =>
                              setEditState((s) =>
                                s ? { ...s, numero_pacchi: e.target.value === '' ? '' : Number(e.target.value) } : s,
                              )
                            }
                            slotProps={{ htmlInput: { min: 0 } }}
                            sx={{ width: 80 }}
                          />
                        ) : (
                          r.numero_pacchi ?? '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <TextField
                            size="small"
                            value={editState.note}
                            onChange={(e) =>
                              setEditState((s) => (s ? { ...s, note: e.target.value } : s))
                            }
                            sx={{ minWidth: 180 }}
                          />
                        ) : (
                          r.note ?? '—'
                        )}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                        {new Date(r.created_at).toLocaleDateString('it-IT')}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <>
                            <Tooltip title="Salva">
                              <span>
                                <IconButton size="small" color="primary" onClick={handleSaveEdit} disabled={saving}>
                                  {saving ? <CircularProgress size={16} /> : <SaveIcon fontSize="small" />}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Annulla modifica">
                              <IconButton size="small" onClick={() => setEditState(null)} disabled={saving}>
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        ) : (
                          <>
                            <Tooltip title="Modifica">
                              <IconButton size="small" onClick={() => handleStartEdit(r)} disabled={saving}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Elimina">
                              <IconButton size="small" color="error" onClick={() => { setDeleteError(''); setDeleteId(r.id) }} disabled={saving}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Chiudi</Button>
        </DialogActions>
      </Dialog>

      {/* Conferma eliminazione */}
      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Conferma eliminazione</DialogTitle>
        <DialogContent>
          {deleteError && <Alert severity="error" sx={{ mb: 2 }}>{deleteError}</Alert>}
          <Typography>
            Vuoi eliminare la distribuzione del{' '}
            <strong>
              {deleteTarget ? new Date(deleteTarget.data).toLocaleDateString('it-IT') : ''}
            </strong>?
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            L'operazione non può essere annullata.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteError(''); setDeleteId(null) }}>Annulla</Button>
          <Button variant="contained" color="error" onClick={handleConfirmDelete} disabled={saving}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Elimina'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
