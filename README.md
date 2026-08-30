# Fila Viva

CRM de fila e convocação de creche para a Secretaria Municipal de Educação do Rio.
Construído sobre as bases públicas do [CIT-SME-RJ/dadoscreche](https://github.com/CIT-SME-RJ/dadoscreche),
processo 195/2025.

Aplicação em https://filaviva.pulsolab.com.br

## Equipe 26

Claude Impact Lab Rio, 2026.

- Laís Rodrigues
- Fabricio Souza
- Mariana Bastos
- Danielle
- Vanessa Rocha

## O problema

Na letra do briefing: a equipe da CRE acompanha milhares de inscrições sem um
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
- **Três visões, um número só**: cada nível vê o que pode mudar. A Secretaria compara as
  12 coordenadorias; a CRE cobra as unidades do polo; o diretor resolve o dia da creche.
  Ninguém vê indicador que não consegue mexer.
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

Usuários criados: um por nível, senha `filaviva2026` em todos. Estão na tabela da seção
seguinte.

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

## Como testar

Quatro contas, uma por nível de acesso. A senha é `filaviva2026` nas quatro. Elas existem
tanto no seed local quanto no staging.

| Entre como | E-mail | O que ele vê |
| --- | --- | --- |
| Secretaria | `secretaria@filaviva.rio` | a rede inteira, as 12 CREs lado a lado |
| CRE | `cre@filaviva.rio` | as unidades da 7ª CRE |
| Diretor | `unidade1@filaviva.rio` | CM Rio Novo - Rio das Flores (Rio das Pedras) |
| Diretor | `unidade2@filaviva.rio` | EDI Escritora Clarice Lispector (Itanhangá) |

O caminho mais curto para ver as três visões, em ordem:

1. Entre como **Secretaria**. A home cai em `/secretaria`. A tabela traz as 12
   coordenadorias ordenadas pela fila. Repare na coluna Confirmação: ela é calculada
   sobre convocação encerrada, não sobre quem ainda está com o prazo correndo.
2. Clique em **Painel de gargalos**. É a mesma tela da CRE, agora sobre a rede inteira:
   prazos vencendo hoje, unidades sem movimento e convocação que expirou sem ninguém
   responder. Clicar no nome de uma unidade leva ao dia dela.
3. Saia e entre como **CRE**. A mesma tela, recortada na 7ª CRE. Troque o código na URL
   por uma unidade de outro polo: a API devolve 403.
4. Saia e entre como **unidade1**. A home cai em `/unidade/0716609`, o dia da creche:
   convocação com dia da régua e prazo, resposta esperando decisão e contato velho na
   frente da fila. Nenhuma comparação com outras unidades — quem cobra é a CRE.

Duas ressalvas sobre o que você vai ver no staging.

O seed carrega um polo só, então **onze das doze CREs aparecem zeradas**. A fila viva
inteira está na 7ª, com cerca de 2,9 mil crianças esperando, a maior parte em Maternal II.
É o desenho do seed, não um erro de contagem.

As colunas de ocupação e déficit por bairro aparecem com traço: elas dependem da carga de
capacidade do datalake, descrita adiante, que ainda não foi rodada.

O staging fica em `https://filaviva.pulsolab.com.br` e só serve as três visões depois que
esta branch entrar na `main` — o deploy sai automático a partir dali. As quatro contas já
existem lá.

## As três visões

**Secretaria** (`/secretaria`) — a rede inteira, uma linha por CRE, ordenada pela fila.
Fila em espera por grupamento, taxa de confirmação, tempo médio da vaga (da abertura à
confirmação), vagas paradas, convocação expirada sem nenhuma resposta e déficit por
bairro. É a tela de onde cobrar e onde investir.

**CRE** (`/painel`) — as unidades do polo. Vagas paradas, prazos vencidos e vencendo
hoje, ranking por confirmação e tentativas, unidades sem movimento em 14 dias,
convocações que expiraram sem contato, inconsistências de cadastro e entrega por canal.

**Diretor** (`/unidade/<código>`) — o dia da creche. Convocações em andamento com dia da
régua e prazo, respostas aguardando decisão, vagas abertas, contato velho na frente da
fila e ocupação por grupamento. Sem comparação com outras unidades: quem cobra é a CRE.

O acesso segue o mesmo desenho. A Secretaria alcança a rede; a CRE, só as unidades do
próprio polo; o servidor da creche, só a dele.

## Capacidade instalada, do datalake da cidade

Dois indicadores — o déficit por bairro e a ocupação por grupamento — comparam a fila com
a capacidade real das turmas. Esse dado não está no sistema de inscrição: vem do
[datalake do Rio](https://www.dados.rio/datalake), tabela `datario.educacao_basica.turma`.

Exporte e carregue:

```bash
bq query --format=json --nouse_legacy_sql '
  SELECT
    t.ano,
    t.id_escola,
    t.grupamento,
    t.turno,
    SUM(t.capacidade_sala) AS capacidade_sala,
    COUNT(DISTINCT a.id_aluno) AS matriculados
  FROM `datario.educacao_basica.turma` t
  LEFT JOIN `datario.educacao_basica.aluno_turma` a
    ON a.id_turma = t.id_turma AND a.ano = t.ano
  WHERE t.ano = 2026 AND t.nivel_ensino = "Educação Infantil"
  GROUP BY 1, 2, 3, 4
' > turmas.json

bun run db:capacidade turmas.json
```

`turma` não tem contagem de matrícula — ela sai do `aluno_turma`, por isso a junção.
Uma ressalva na capacidade: duas turmas que dividem a mesma sala somam a sala duas vezes.
Enquanto a rede for de turno único por sala isso não aparece; em turno duplo, superestima.

O importador soma as turmas por unidade, grupamento e turno, traduz o turno da SME
(manhã, tarde, integral) para a jornada da fila (Integral, Parcial) e ignora escola que
não está na base. Sem essa carga, as duas telas mostram traço em vez de fingir zero.

Vale olhar também `datario.educacao_basica.escola`, que traz endereço, telefone e direção
de cada unidade — hoje a convocação manda a família para o bairro, não para a rua.

## Arquitetura

```
apps/web       Next.js App Router — fila, ficha, as três visões, auditoria e régua
apps/api       Elysia — REST, Better Auth, webhooks dos canais, enfileiramento
apps/worker    BullMQ — cadência de tentativas e expiração de prazo
packages/core  máquina de estados, dias úteis, elegibilidade e as consultas das três visões
packages/db    schema Drizzle e migrações
packages/auth  configuração do Better Auth
packages/channels  interface Channel e adapters mock, Kapso, Contele e Resend
packages/ai    classificação, resumo e rascunho com Claude, com regra local de reserva
packages/seed  carga a partir do dadoscreche e da capacidade do datalake
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
