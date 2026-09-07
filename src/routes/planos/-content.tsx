import { useRef, useState } from 'react'
import { Download, FolderPlus, Plus, Upload, Target } from 'lucide-react'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { KpiCard, KpiCardGrid } from '@/components/kpi'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useDocumentTitle } from '@/hooks/use-document-title'
import type { Plan } from '@/data/types'
import { shiftMonth } from '@/lib/finance'
import { formatBRL, formatMonthShort, plural } from '@/lib/format'
import { installmentAmount, parsePlans, planOccursIn } from '@/lib/plans'
import { useFilters } from '@/providers/use-filters'
import { usePlans } from '@/providers/use-plans'
import { PLANOS_METRICS } from './-metric-definitions'
import { PlanList } from './-components/plan-list'
import { GroupDialog } from './-components/group-dialog'
import { PlanSheet } from './-components/plan-sheet'

export function PlanosPageContent() {
  useDocumentTitle('Planos')

  const { monthsWithData } = useFilters()
  const { groups, items, decided, addPlan, updatePlan, removePlan, addGroup, removeGroup, data, replaceAll } = usePlans()

  const [open, setOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [editing, setEditing] = useState<Plan | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const lastMonth = monthsWithData.at(-1) ?? new Date().toISOString().slice(0, 7)
  const nextMonth = shiftMonth(lastMonth, 1)

  const totalDecided = decided.reduce((s, p) => s + p.amount, 0)
  const totalConsidering = items.filter((p) => p.status === 'considering').reduce((s, p) => s + p.amount, 0)
  const dueNext = decided.filter((p) => planOccursIn(p, nextMonth)).reduce((s, p) => s + installmentAmount(p), 0)

  const exportPlans = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'planos.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const importPlans = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        // `parsePlans` é a fronteira: o arquivo veio de fora e nada nele é confiável.
        replaceAll(parsePlans(JSON.parse(String(reader.result))))
      } catch {
        // Arquivo ilegível: a lista atual fica como está, sem estourar a tela.
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="space-y-2">
        <Breadcrumbs />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Planos</h1>
            <p className="text-xs text-muted-foreground">
              O que você pretende comprar. Um plano <strong className="font-medium">decidido</strong> entra na previsão como origem própria; um <strong className="font-medium">em estudo</strong> só
              aparece quando você liga a simulação na tela de Previsão. Esta lista vive no navegador — exporte para levá-la a outro lugar.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" onClick={() => setGroupOpen(true)}>
              <FolderPlus data-icon="inline-start" /> Novo grupo
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              <Plus data-icon="inline-start" /> Novo plano
            </Button>
          </div>
        </div>
      </header>

      <KpiCardGrid columns={3}>
        <KpiCard label="Decidido" definition={PLANOS_METRICS.decided} value={formatBRL(totalDecided)} hint={`${decided.length} ${plural(decided.length, 'plano', 'planos')} na previsão`} />
        <KpiCard label="Em estudo" definition={PLANOS_METRICS.considering} value={formatBRL(totalConsidering)} hint="Fora da previsão até você decidir" />
        <KpiCard label="Cai em" definition={PLANOS_METRICS.nextMonth} value={formatBRL(dueNext)} hint={formatMonthShort(nextMonth)} />
      </KpiCardGrid>

      {items.length === 0 && groups.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Target />
            </EmptyMedia>
            <EmptyTitle>Nenhum plano ainda</EmptyTitle>
            <EmptyDescription>Anote o que você pretende comprar — com valor, mês e parcelamento — e a tela de Previsão mostra se cabe.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>A lista</CardTitle>
            <CardDescription>
              {items.length} {plural(items.length, 'plano', 'planos')} em {groups.length + 1} {plural(groups.length + 1, 'grupo', 'grupos')}. Remover um grupo não remove os itens: eles voltam a ser
              avulsos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanList
              groups={groups}
              items={items}
              onRemove={removePlan}
              onRemoveGroup={removeGroup}
              onEdit={(plan) => {
                setEditing(plan)
                setOpen(true)
              }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Levar a lista com você</CardTitle>
          <CardDescription>
            Os planos ficam no <code className="font-mono">localStorage</code> deste navegador — some ao limpar os dados do site e não vai para outro dispositivo. Diferente do resto do app, ele não
            nasce de um arquivo em <code className="font-mono">docs/</code>, então a previsão com planos não é reproduzível num clone novo. Exportar é o que fecha essa ponta.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPlans} disabled={items.length === 0 && groups.length === 0}>
            <Download data-icon="inline-start" /> Exportar ({items.length})
          </Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload data-icon="inline-start" /> Importar
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="sr-only"
            aria-label="Importar planos de um arquivo JSON"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importPlans(file)
              e.target.value = ''
            }}
          />
        </CardContent>
      </Card>

      <GroupDialog open={groupOpen} onOpenChange={setGroupOpen} defaultMonth={nextMonth} monthsWithData={monthsWithData} onSubmit={addGroup} />

      <PlanSheet
        open={open}
        onOpenChange={setOpen}
        groups={groups}
        defaultMonth={nextMonth}
        monthsWithData={monthsWithData}
        editing={editing}
        onSubmit={(plan) => {
          if (editing) updatePlan(editing.id, plan)
          else addPlan(plan)
        }}
      />
    </div>
  )
}
