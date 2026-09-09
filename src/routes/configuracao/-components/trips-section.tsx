import { Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Trip } from '@/data/types'

/**
 * As viagens que você fez.
 *
 * **Viagem é DECLARADA, não detectada.** Detectar foi tentado: um detector de "estabelecimentos
 * novos agrupados em poucos dias" marcou dezoito janelas, e a maioria eram MUDANÇAS de cidade,
 * que produzem o mesmo padrão. E o gasto não se separa do cotidiano sem a data — passagem e
 * hospedagem são compradas meses antes.
 *
 * Você dá ida, volta e destino; o custo o ingest calcula somando a janela. Por isso editar uma
 * data aqui só muda o número depois de reprocessar: o custo é medido, não declarado.
 */
export function TripsSection({ trips, onChange, disabled }: { trips: Trip[]; onChange: (next: Trip[]) => void; disabled: boolean }) {
  const patch = (index: number, change: Partial<Trip>) => onChange(trips.map((t, i) => (i === index ? { ...t, ...change } : t)))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Viagens</CardTitle>
        <CardDescription>Você dá ida, volta e destino; o custo sai da soma da janela — por isso ele só muda depois de reprocessar os arquivos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {trips.map((trip, index) => (
          <div key={trip.id} className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="text-muted-foreground block">Destino</span>
              <Input value={trip.label} disabled={disabled} className="w-48" onChange={(e) => patch(index, { label: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground block">Ida</span>
              <Input type="date" value={trip.from} disabled={disabled} className="w-40" onChange={(e) => patch(index, { from: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground block">Volta</span>
              <Input type="date" value={trip.to} disabled={disabled} className="w-40" onChange={(e) => patch(index, { to: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground block">Nota</span>
              <Input value={trip.note ?? ''} disabled={disabled} className="w-48" onChange={(e) => patch(index, { note: e.target.value || undefined })} />
            </label>
            <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`Remover a viagem ${trip.label}`} onClick={() => onChange(trips.filter((_, i) => i !== index))}>
              <Trash />
            </Button>
          </div>
        ))}
        {trips.length === 0 && <p className="text-muted-foreground">Nenhuma viagem declarada.</p>}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          // Ida e volta nascem no MESMO dia: a validação recusa volta antes da ida, e uma
          // janela invertida produziria custo zero sem nenhum aviso.
          onClick={() => onChange([...trips, { id: `viagem-${trips.length + 1}`, label: 'Nova viagem', from: '2026-01-01', to: '2026-01-01' }])}
        >
          <Plus /> Adicionar viagem
        </Button>
      </CardContent>
    </Card>
  )
}
