import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  /**
   * O `.env` vem da RAIZ, e não de `apps/web/`.
   *
   * É o mesmo arquivo que o servidor e o `drizzle-kit` leem (`@wlet/env`), para `VITE_API_URL`
   * não ser a única variável do repositório morando noutro lugar.
   *
   * **E é por isso que o prefixo `VITE_` importa aqui mais do que em qualquer outro projeto:**
   * este arquivo agora tem `DATABASE_URL` e `AUTH_SECRET` ao lado, e quem impede os dois de irem
   * para dentro do bundle é essa regra — o Vite só expõe ao cliente o que começa com `VITE_`.
   * Não mexa em `envPrefix`: com ele afrouxado, a senha do banco viaja para o navegador.
   */
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
