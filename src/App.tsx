import { lazy } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './components/layout/app-shell'
import NaoEncontradoPageContent from './routes/nao-encontrado'

// Cada rota carrega sob demanda pelo próprio `index.tsx`, que é a face pública dela.
// O Recharts só entra no bundle de quem abre um gráfico.
const Overview = lazy(() => import('./routes'))
const Transacoes = lazy(() => import('./routes/transacoes'))
const Categorias = lazy(() => import('./routes/categorias'))
const Contas = lazy(() => import('./routes/contas'))
const Transferencias = lazy(() => import('./routes/transferencias'))
const Previsao = lazy(() => import('./routes/previsao'))

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Overview />} />
        <Route path="/transacoes" element={<Transacoes />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/contas" element={<Contas />} />
        <Route path="/transferencias" element={<Transferencias />} />
        <Route path="/previsao" element={<Previsao />} />
        <Route path="*" element={<NaoEncontradoPageContent />} />
      </Route>
    </Routes>
  )
}
