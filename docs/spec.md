# Fila Viva — spec de implementação

CRM de fila e convocação de creche para a SME-Rio. Contrato desta build, derivado do
`PRD-crm-convocacao-creche.md` e do design system `Fila Viva`.

## O que entra

Escopo fechado do PRD: fila viva, ficha da criança, convocação automática com worker,
máquina de estados, CRM com auditoria, Claude no loop humano, painel CRE e autenticação.

Provedores externos entram atrás de uma interface só. O adapter `mock` funciona ponta a
ponta sem chave nenhuma; Kapso, Contele, Resend e Bedrock ligam por variável de ambiente.

## Monorepo

```
packages/db        schema Drizzle, migrações, seed a partir do dadoscreche
packages/core      máquina de estados, dias úteis, elegibilidade, badges
packages/channels  interface Channel + adapters mock/kapso/contele/resend
packages/ai        classificação, resumo e rascunho com Claude; fallback por palavra-chave
apps/api           Elysia: rotas REST, Better Auth, webhooks, enfileiramento
apps/worker        BullMQ: cadência de tentativas e expiração de prazo
apps/web           Next.js App Router com os tokens do design system
```

O Next fala com a API por rewrite em `/api/*`, então o cookie de sessão é same-origin.

## Máquina de estados da opção

```
Lista de espera --abrir vaga | manual--> Selecionado
Selecionado     --SIM | manual----------> Confirmado
Selecionado     --prazo vencido---------> Cancelado pelo sistema --> reabre vaga
Selecionado     --desistiu | não localizado--> Cancelado
Confirmado em uma opção --> demais opções do cadastro --> Cancelado na confirmacao
```

Toda transição passa por uma função só, `transicionar()`, que valida a aresta, grava
`evento_auditoria` e exige motivo nas transições manuais. Não existe `update` de situação
fora dela.

## Convocação

Abrir vaga escolhe a próxima criança elegível: situação `Lista de espera`, turno e
grupamento compatíveis, sem `Confirmado` em qualquer unidade e sem convocação aberta.
Empate na pontuação decide pela data de inscrição.

Prazo: três dias úteis pelo calendário do Rio em 2026. Cadência de tentativas:

| Dia | Canais |
|---|---|
| D0 | WhatsApp |
| D1 | WhatsApp e SMS |
| D2 | SMS e e-mail |

Um envio por canal por dia, no máximo. O job carrega uma chave idempotente
`convocacao:canal:dia`; repetição é descartada, não duplicada.

Prazo vencido sem confirmação vira `Cancelado pelo sistema` e reabre a vaga.

## Claude

Classifica a resposta da família em `confirma | extensao | desiste | duvida | outro`,
com confiança e trecho-chave, e sugere a ação. A sugestão fica pendente até um servidor
aprovar — nenhuma transição acontece por conta da IA. Sem credencial, o classificador cai
para regra por palavra-chave e marca a origem como `fallback`.

## Papéis

`unidade` vê e opera a própria unidade. `cre` vê todas as unidades do polo, concede
extensão de prazo e abre o painel de gargalos. A checagem vive num macro do Elysia.

## Imutável

Pontuação, posição na fila e respostas socioeconômicas são somente leitura em toda a
aplicação. Correção de bairro e CEP grava campo novo e preserva o original.

## Fora desta build

Instagram e outros canais sociais, ligação por voz, mudança da régua de pontuação,
previsão territorial e aplicativo para a família.
