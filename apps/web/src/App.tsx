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
const Patrimonio = lazy(() => import('./routes/patrimonio'))
const Planos = lazy(() => import('./routes/planos'))
const Pagamentos = lazy(() => import('./routes/pagamentos'))
const Cobrancas = lazy(() => import('./routes/cobrancas'))
const Previsao = lazy(() => import('./routes/previsao'))
const Rubricas = lazy(() => import('./routes/rubricas'))
const Dados = lazy(() => import('./routes/dados'))
const Configuracao = lazy(() => import('./routes/configuracao'))

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Overview />} />
        <Route path="/transacoes" element={<Transacoes />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/contas" element={<Contas />} />
        <Route path="/transferencias" element={<Transferencias />} />
        <Route path="/dados" element={<Dados />} />
        <Route path="/configuracao" element={<Configuracao />} />
        <Route path="/patrimonio" element={<Patrimonio />} />
        <Route path="/planos" element={<Planos />} />
        <Route path="/rubricas" element={<Rubricas />} />
        <Route path="/pagamentos" element={<Pagamentos />} />
        <Route path="/cobrancas" element={<Cobrancas />} />
        <Route path="/previsao" element={<Previsao />} />
        <Route path="*" element={<NaoEncontradoPageContent />} />
      </Route>
    </Routes>
  )
}
