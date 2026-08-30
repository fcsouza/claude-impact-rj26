# Fila Viva

**Equipe 26** — Laís Rodrigues, Fabricio Souza, Mariana Bastos, Danielle e Vanessa Rocha.
Claude Impact Lab Rio 2026.

CRM de fila e convocação de creche para a Secretaria Municipal de Educação do Rio.
Construído sobre as bases públicas do [CIT-SME-RJ/dadoscreche](https://github.com/CIT-SME-RJ/dadoscreche),
processo 195/2025.

O problema, na letra do briefing: a equipe da CRE acompanha milhares de inscrições sem um
painel que diga, por unidade e por criança, há quanto tempo uma vaga está aguardando
confirmação — nem que aponte conflitos dentro do mesmo cadastro. A convocação é feita à
mão pelas escolas, uma tentativa por dia durante três dias, sem registro com horário.

Este sistema faz a convocação acontecer sozinha, guarda cada tentativa com autor e
horário, e deixa a decisão com o servidor.

## O que ele faz

- **Fila viva por unidade**: turno, grupamento, pontuação e ordem de inscrição, com os
  sinais que a operação precisa ver — convocado há N dias, prazo vencido, contato velho,
  bairro diferente do da creche e cadastro inconsistente.
- **Convocação automática**: abrir uma vaga seleciona a próxima criança elegível, cria a
  convocação com prazo de três dias úteis e dispara WhatsApp no D0, WhatsApp e SMS no D1,
  SMS e e-mail no D2. Um envio por canal por dia, no máximo.
- **Ficha da criança**: dados imutáveis da inscrição, contato versionado e uma timeline
  única com tentativas, respostas, mudanças de situação, notas e edições de contato.
- **Claude no meio do laço**: lê a resposta da família, classifica em confirma, extensão,
  desistência, dúvida ou outro, e sugere a ação. Quem aplica é o servidor — a IA nunca
  muda situação sozinha.
- **Painel da CRE**: vagas paradas, inconsistências, conversão por unidade, fila por
  bairro e entrega por canal.
- **Auditoria**: toda mutação grava antes, depois, autor e horário.

## Como rodar

```bash
bun install
cp .env.example .env          # preencha DATABASE_URL e BETTER_AUTH_SECRET
docker compose up -d redis    # a fila de convocação precisa de Redis
bun run db:migrate
git clone https://github.com/CIT-SME-RJ/dadoscreche .dados/dadoscreche
bun run db:seed
bun run dev
```

O seed lê as bases reais, escolhe as duas unidades com maior fila em bairros distintos,
gera nomes fictícios em português e aponta os contatos para os telefones em
`SEED_TELEFONES`. Ele também deixa uma convocação vencida e uma inconsistência prontas
para a demonstração.

Usuários criados: `unidade1@filaviva.rio`, `unidade2@filaviva.rio` e `cre@filaviva.rio`,
senha `filaviva2026`.

Com tudo de pé: front em http://localhost:3000, API em http://localhost:3333.

### Docker

```bash
docker compose up --build
```

Sobe Redis, API, worker e front. `--profile local-db` acrescenta um Postgres local se você
não usar Neon.

## Staging

O ambiente vive no Dokploy, em `https://filaviva.pulsolab.com.br`.

O caminho é o mesmo dos outros projetos da casa: o GitHub Actions constrói as
três imagens a cada push na `main` e publica em `ghcr.io/fcsouza/claude-impact-rj26`;
em seguida chama `compose.deploy` no Dokploy, que puxa as imagens e sobe o
`docker-compose-production.yml`. O banco continua no Neon; o Redis sobe junto do
compose.

Só o front recebe domínio. A API fica na rede interna, alcançada pelo Next em
`http://api:3333` — quando os webhooks dos provedores entrarem, ela ganha um
domínio próprio e a rede `dokploy-network`.

Segredos do Actions: `DOKPLOY_URL`, `DOKPLOY_API_KEY` e `DOKPLOY_COMPOSE_ID`.
As variáveis da aplicação ficam no próprio compose, no painel do Dokploy.

## Arquitetura

```
apps/web       Next.js App Router — fila, ficha, painel, auditoria e régua
apps/api       Elysia — REST, Better Auth, webhooks dos canais, enfileiramento
apps/worker    BullMQ — cadência de tentativas e expiração de prazo
packages/core  máquina de estados, dias úteis, elegibilidade e consultas do painel
packages/db    schema Drizzle e migrações
packages/auth  configuração do Better Auth
packages/channels  interface Channel e adapters mock, Kapso, Contele e Resend
packages/ai    classificação, resumo e rascunho com Claude, com regra local de reserva
packages/seed  carga a partir do dadoscreche
```

O navegador fala só com o Next, que repassa `/api/*` para o Elysia. O cookie de sessão
fica na mesma origem.

### Máquina de estados

```
Lista de espera --abrir vaga | manual--> Selecionado
Selecionado     --SIM | manual---------> Confirmado
Selecionado     --prazo vencido--------> Cancelado pelo sistema --> reabre a vaga
Selecionado     --desistiu | não localizado--> Cancelado
Confirmado --> demais opções do cadastro --> Cancelado na confirmacao
```

Toda transição passa por `transicionar()`, que valida a aresta, exige motivo escrito nas
mudanças manuais e grava o evento de auditoria. Não existe `update` de situação fora dela.

### Canais e IA

Cada canal implementa a mesma interface: `send()` e `parseWebhook()`. O adapter `mock`
funciona ponta a ponta sem chave nenhuma e escreve a mensagem no log do worker; Kapso,
Contele e Resend entram por variável de ambiente. Claude atende por API direta ou
Bedrock; sem credencial, a classificação cai numa regra por palavra-chave e a origem fica
marcada como `fallback` na tela.

## Dados

As bases são anonimizadas: código artificial para criança e responsável, nascimento só em
ano-mês, endereço só em bairro e CEP. Os indicadores ilustram a dinâmica do processo e não
representam a matrícula real do município.

## Limites conhecidos

- Os nomes são fictícios e os contatos do seed apontam para telefones do time.
- A régua de pontuação é somente leitura e vem da Query C do ano vigente.
- Calendário de feriados do Rio fixado em 2026, num arquivo só.
