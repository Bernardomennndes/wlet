/**
 * COM QUE SERVIDOR o app fala — respondido num lugar só.
 *
 * Havia duas leituras de `VITE_API_URL`, uma no composition root dos serviços e outra no cliente
 * de autenticação, cada uma com a sua própria mensagem de erro e a sua própria regra para tirar
 * o `/v1`. Duas leituras do mesmo ambiente divergem na primeira mudança, e o sintoma seria o
 * pior possível de diagnosticar: login que funciona e dado que volta 401, ou o contrário.
 *
 * O acesso é DEFENSIVO porque `import.meta.env` não existe fora do Vite, e o runner dos testes
 * roda por tsx: sem o `?.`, importar este módulo estoura em Node com "Cannot read properties of
 * undefined". Mesma armadilha do `import.meta.glob` em `generated-files.ts`.
 */
function fromEnv(): string | undefined {
  return (import.meta.env as Record<string, string> | undefined)?.VITE_API_URL
}

/**
 * O endereço do canal de dados, com o `/v1`. LANÇA quando não há.
 *
 * Não tem padrão de propósito. Enquanto os dados também podiam ficar no navegador, a ausência
 * desta variável era uma ESCOLHA — "rode tudo local" — e cair num modo era a resposta certa.
 * Agora não é: sem servidor não há conta, não há sessão e não há dado, e um endereço adivinhado
 * só adiaria o erro até a primeira requisição, onde ele chega como 404 sem explicação.
 */
export function apiUrl(): string {
  const url = fromEnv()
  if (!url) throw new Error('VITE_API_URL não definida: sem ela o app não sabe com que servidor falar. Preencha-a no .env da raiz (veja .env.example).')
  return url
}

/**
 * A RAIZ da mesma origem, sem o `/v1`.
 *
 * É onde o Better Auth mora (`/api/auth/*`), e sai daqui em vez de uma variável própria pela
 * mesma razão que este arquivo existe: um servidor, um endereço.
 */
export function apiOrigin(): string {
  return apiUrl().replace(/\/v1\/?$/, '')
}
