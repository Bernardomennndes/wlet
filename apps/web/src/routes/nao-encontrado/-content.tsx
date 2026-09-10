import { Link } from 'react-router'
import { Compass } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useDocumentTitle } from '@/hooks/use-document-title'

export function NaoEncontradoPageContent() {
  useDocumentTitle('Página não encontrada')
  return (
    <Empty className="gap-3 py-24">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Compass />
        </EmptyMedia>
        {/* O <h1> fica dentro do EmptyTitle: o título é um <div> e não aceita `render`,
            e a rota 404 não pode perder o heading. As classes restauram a tipografia atual. */}
        <EmptyTitle>
          <h1 className="text-lg font-semibold tracking-tight">Página não encontrada</h1>
        </EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="link" render={<Link to="/" />}>
          Voltar à visão geral
        </Button>
      </EmptyContent>
    </Empty>
  )
}
