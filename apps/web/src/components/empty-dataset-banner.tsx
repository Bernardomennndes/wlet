import { Database } from '@phosphor-icons/react'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { META } from '@/lib/finance'

/**
 * O aviso de que não há dado NENHUM — e o caminho para sair disso.
 *
 * Sem ele o app abre com "R$ 0,00" em todo lugar, e zero AFIRMA que não houve movimento
 * quando a verdade é que não há de onde saber. É a mesma regra do `<NotInformed>`, aplicada à
 * tela inteira: ausência não é zero. Aqui não dá para trocar cada número por "Não informado"
 * — são dez telas —, então quem carrega a informação é uma faixa que vale para todas.
 *
 * Ele fica na CASCA, e não em cada rota, porque a condição é única: `META.months` vazio. E ele
 * some sozinho no instante em que o primeiro extrato é lido, sem ninguém precisar apagá-lo.
 */
export function EmptyDatasetBanner() {
  const { pathname } = useLocation()
  // Em "Meus dados" a faixa apontaria para o botão logo abaixo dela.
  if (META.months.length > 0 || pathname === '/dados') return null
  return (
    <div className="border-border bg-muted/40 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="flex items-start gap-3">
        <Database className="text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">Nenhum extrato foi lido ainda</p>
          <p className="text-muted-foreground text-xs">Os números desta tela são zeros porque não há dado nenhum — não porque não houve movimento.</p>
        </div>
      </div>
      <Button size="sm" render={<Link to="/dados" />}>
        Ler os meus extratos
      </Button>
    </div>
  )
}
