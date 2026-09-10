/**
 * Os utilitários puros que o app e a interface dividem.
 *
 * O critério para entrar aqui é ter mais de um consumidor E não pertencer a nenhum domínio:
 * `format` é lido por 39 arquivos e não sabe o que é uma transação; `cn` é infraestrutura de
 * className. O que tem UM consumidor fica com ele — as máscaras de dinheiro e de quantidade
 * moram em `@wlet/ui`, porque só os campos delas as usam.
 */
export * from './format'
export * from './utils'
