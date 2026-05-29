import { Chip } from '@mui/material'

export type StatoNucleo = 'verde' | 'nero' | 'rosso' | 'bozza'

const CONFIG: Record<StatoNucleo, { label: string; color: 'success' | 'default' | 'error' | 'info' | 'warning' }> = {
  bozza: { label: 'Bozza', color: 'warning' },
  verde: { label: 'Attivo', color: 'success' },
  nero:  { label: 'Non rinnovato', color: 'default' },
  rosso: { label: 'Sospeso', color: 'error' },
}

export default function StatusChip({ stato }: { stato: StatoNucleo }) {
  const cfg = CONFIG[stato] ?? CONFIG.verde
  return <Chip label={cfg.label} color={cfg.color} size="small" sx={{ fontWeight: 600 }} />
}
