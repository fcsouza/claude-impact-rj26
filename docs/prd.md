# PRD — CRM de Fila e Convocação de Creche (SME-Rio)

**Evento:** Claude Impact Lab Rio 2 — 30/08/2026
**Prazo:** 16h30 (entrega no GitHub + e-mail eventos@taicor.ai com nº do grupo)
**Status:** escopo fechado

---

## 1. Problema

A SME-Rio tem vagas ociosas em creches e, ao mesmo tempo, listas de espera expressivas. A própria secretaria define: "é uma fila de preferência, não de ausência de vaga".

O gargalo está na retaguarda gerida manualmente pelas 11 CREs, em especial na **convocação**: quando uma vaga abre, a escola faz 1 tentativa de contato por dia, por 3 dias, por telefone/e-mail/WhatsApp/SMS; a família tem 3 dias úteis para comparecer. Nada disso é registrado com timestamp, nada é rastreável, e o sistema atual seleciona 5 crianças por escolha — cada uma com seu ciclo de 3 dias.

Gaps nomeados no briefing oficial:

| # | Gap | Impacto |
|---|-----|---------|
| 1 | Fila sem visibilidade de prazo | Ninguém sabe há quanto tempo uma vaga está "Selecionada" |
| 2 | Estados transitórios não sinalizados | ~0,2% das inscrições com "Selecionado" + "Lista de espera" no mesmo cadastro |
| 3 | Contatos desatualizados | Convocação demorada, vaga passa adiante |
| 4 | Régua muda todo ano | Difícil explicar posição à família |
| 5 | Fila represada com vaga ociosa perto | Descompasso território × turno |

**Problema central (texto literal do briefing):** a equipe da CRE/polo acompanha milhares de inscrições sem um painel que sinalize, por unidade e por criança, há quanto tempo uma vaga está "Selecionada" aguardando confirmação, ou que aponte inconsistências entre as opções de um mesmo cadastro.

## 2. Evidência nos dados (DuckDB sobre Query A, 2021–2025)

- 837.179 opções, 343.308 inscrições, ~260k crianças, 872 unidades.
- Confirmação por ordem da opção: 1ª = 38,3%, 2ª = 16,1%, 3ª = 11,1%, 4ª = 8,4%, 5ª = 7,5%.
- "Cancelado na confirmação" cresce da 1ª (11,7%) à 5ª opção (17,0%).
- Família em bairro ≠ unidade: 19,1% confirma vs 27,0% no mesmo bairro.
- Lista de espera caiu de 34,5% (2021) para 10,2% (2025); confirmação subiu de 14,7% para 30,4%.
- Integral = 83% das opções.

## 3. Solução

Um CRM operacional para unidades e CREs que:

1. Mostra a fila viva por unidade/turno/grupamento com a régua vigente.
2. Ao abrir uma vaga, convoca automaticamente a próxima criança por WhatsApp → SMS → e-mail, seguindo a regra atual (1 tentativa/dia, 3 dias, 3 dias úteis para confirmar), registrando tudo com timestamp.
3. Deixa o servidor atualizar contato, status e notas com auditoria completa.
4. Usa Claude para interpretar a resposta da família e sugerir a ação.
5. Dá à CRE um painel de gargalos.

**Fora de escopo (v1):** Instagram/outros canais sociais, ligação telefônica automatizada, mudança da régua de pontuação, previsão territorial de demanda, app para a família.

## 4. Usuários

| Papel | Quem | Vê | Faz |
|-------|------|----|-----|
| `unidade` | Diretor/secretário da creche | Só sua unidade | Abre vaga, edita contato, registra tentativa manual, muda status, escreve nota |
| `cre` | Equipe da Coordenadoria Regional | Todas as unidades do polo | Tudo acima + painel + concede extensão |

## 5. Critérios de avaliação e como atendemos

| Critério | Peso | Como pontuamos |
|----------|------|----------------|
| Impacto Real | 40 | Resolve o "problema central" literal; automatiza a regra que já existe sem mudar processo |
| Produto | 20 | Servidor não técnico opera sem treino: fila → botão → timeline |
| Engenharia | 20 | Máquina de estados explícita, auditoria, adapters de canal, filas com retry, dado real |
| Ideia | 10 | Log de convocação que hoje não existe + Claude no loop humano |
| Apresentação | 10 | Demo ao vivo com WhatsApp chegando no celular |

## 6. Requisitos funcionais

### RF1 — Fila viva
- RF1.1 Listar opções por unidade → turno (Integral/Parcial) → grupamento (Berçário, Maternal I, Maternal II), ordenadas por pontuação desc, empate por data de inscrição.
- RF1.2 Exibir pontuação total e breakdown por critério (Query C 2025).
- RF1.3 Filtro por situação: Lista de espera, Selecionado, Ativo, Confirmado.
- RF1.4 Badges por linha: "Selecionado há N dias", "Inconsistência" (mesmo `aluno_anon` com Selecionado + Lista de espera em outra unidade), "Contato desatualizado" (>12 meses sem edição), "Bairro diferente".
- RF1.5 Botão **Abrir vaga** (turno + grupamento) → dispara RF3.
- RF1.6 Busca por código anonimizado / nome fictício do seed.

### RF2 — Ficha da criança
- RF2.1 Dados da inscrição (imutáveis): opções, unidades, grupamento, turno, bairro/CEP, data de criação, respostas socioeconômicas confirmadas.
- RF2.2 Contato (editável, versionado): telefone, WhatsApp, e-mail, melhor horário, observação.
- RF2.3 Timeline unificada: tentativas automáticas, tentativas manuais, mudanças de status, notas, edições de contato — ordem cronológica, autor e timestamp.
- RF2.4 Notas livres por criança.
- RF2.5 Resumo em linguagem simples gerado por Claude (situação atual + próximo passo).

### RF3 — Convocação automática
- RF3.1 Ao abrir vaga, selecionar a próxima criança elegível da fila (situação `Lista de espera`, turno e grupamento compatíveis, sem `Confirmado` em outra unidade).
- RF3.2 Transicionar opção para `Selecionado`, criar `convocacao` com `prazo_fim` = +3 dias úteis (calendário Rio 2026).
- RF3.3 Cadência de tentativas:
  - D0: WhatsApp
  - D1: WhatsApp + SMS
  - D2: SMS + e-mail
- RF3.4 Cada disparo gera `tentativa` com canal, status (`enviado`, `entregue`, `lido`, `falhou`, `respondido`), payload, `provider_id`.
- RF3.5 Webhooks por canal atualizam status da tentativa.
- RF3.6 Resposta inbound do WhatsApp → RF5.
- RF3.7 Prazo vencido sem confirmação → `Cancelado pelo sistema` + abre vaga novamente (loop).
- RF3.8 Confirmação → `Confirmado` + demais opções do cadastro → `Cancelado na confirmacao`.
- RF3.9 Mensagens em template fixo com nome fictício, unidade, endereço, prazo e instrução de resposta ("Responda SIM para confirmar").
- RF3.10 Adapter `mock` obrigatório: escreve tentativa sem chamar provedor.

### RF4 — CRM (edição pelo servidor)
- RF4.1 Editar contato; guardar valor anterior, autor, timestamp.
- RF4.2 Transição manual de status com motivo obrigatório. Transições permitidas:
  - `Lista de espera` → `Selecionado` (manual)
  - `Selecionado` → `Confirmado` | `Cancelado` (desistiu / não localizado)
  - `Selecionado` → `Selecionado` com extensão (+1 dia útil, justificativa obrigatória, apenas `cre`)
- RF4.3 Registrar tentativa manual (ligação, presencial) com resultado.
- RF4.4 Notas.
- RF4.5 Correção de bairro/CEP com flag `corrigido_por_cre`, sem sobrescrever o original.
- RF4.6 **Não editável:** pontuação, posição na fila, respostas socioeconômicas.

### RF5 — Claude na aplicação
- RF5.1 Classificar resposta inbound em `confirma | extensao | desiste | duvida | outro`, com confiança e trecho-chave.
- RF5.2 Sugerir ação ao servidor; servidor aprova ou edita. Nunca muda status sozinho.
- RF5.3 Gerar resumo da ficha (RF2.5).
- RF5.4 Gerar rascunho de resposta à família quando `duvida`.
- RF5.5 Modelo: Claude Sonnet via Amazon Bedrock. Prompt e saída em JSON estruturado.

### RF6 — Painel CRE
- RF6.1 Vagas `Selecionado` sem resposta há > N dias (N configurável, default 2).
- RF6.2 Por unidade: taxa de confirmação, tempo médio de convocação, tentativas médias até resposta.
- RF6.3 Ocupação × fila por bairro (tabela; mapa se sobrar tempo).
- RF6.4 Lista de inconsistências (RF1.4).

### RF7 — Auth
- RF7.1 Better Auth, e-mail + senha, dois papéis.
- RF7.2 Usuários seed: 2 unidades, 1 CRE.

## 7. Requisitos não funcionais

- RNF1 Toda mutação gera `evento_auditoria` (entidade, id, antes, depois, autor, timestamp).
- RNF2 Jobs idempotentes; retry com backoff; nunca duplicar tentativa no mesmo dia/canal.
- RNF3 Webhooks validam assinatura quando o provedor oferece; caso contrário, token na URL.
- RNF4 Sem dado pessoal real: contatos do seed são fictícios e apontam para celulares do time.
- RNF5 Deploy público (Vercel ou ECS) até 16h.
- RNF6 Reprodutível: `bun install && bun db:seed && bun dev` funciona do zero.

## 8. Modelo de dados

```
usuario           id, email, papel (unidade|cre), unidade_id?, cre_id?
unidade           esc_codigo (PK), nome, tipo, bairro, cep, cre_id
inscricao         id (prm-plm-ipl), ano, aluno_anon, responsavel_anon,
                  nascimento_anomes, sexo, bairro, cep, data_criacao,
                  pontuacao_total, criterios_json          -- imutável
opcao             id, inscricao_id, ordem, unidade_id, grupamento,
                  turno, situacao, situacao_atualizada_em
contato           id, inscricao_id, telefone, whatsapp, email,
                  melhor_horario, obs, versao, autor_id, criado_em
convocacao        id, opcao_id, vaga_id, iniciada_em, prazo_fim,
                  extensoes, status (aberta|confirmada|expirada|cancelada)
tentativa         id, convocacao_id, canal (whatsapp|sms|email|telefone|presencial),
                  origem (auto|manual), status, provider_id,
                  payload_json, agendada_para, executada_em
mensagem_inbound  id, convocacao_id, canal, texto, recebida_em,
                  classificacao, confianca, acao_sugerida, acao_aplicada
nota              id, inscricao_id, texto, autor_id, criado_em
evento_auditoria  id, entidade, entidade_id, acao, antes_json,
                  depois_json, autor_id, criado_em
vaga              id, unidade_id, turno, grupamento, aberta_em,
                  aberta_por, preenchida_por_opcao_id?
```

**Máquina de estados da opção**

```
Lista de espera ──abrir vaga / manual──▶ Selecionado
Selecionado ──resposta SIM / manual──▶ Confirmado
Selecionado ──prazo vencido──▶ Cancelado pelo sistema ──▶ reabre vaga
Selecionado ──desistiu / não localizado──▶ Cancelado
Confirmado (em outra unidade) ──▶ Cancelado na confirmacao (demais opções)
```

## 9. Arquitetura

- **App:** Next.js (App Router), server actions para mutações, Tailwind.
- **API/worker:** Elysia (ou route handlers) + BullMQ worker separado. Filas: `convocacao.tentativa`, `convocacao.expirar`.
- **DB:** Postgres (Neon) + Drizzle. Redis para BullMQ.
- **Auth:** Better Auth.
- **Canais:** interface `Channel { send(msg): Promise<SendResult>; parseWebhook(req): TentativaUpdate }` com adapters `kapso`, `contele`, `resend`, `mock`.
- **IA:** Claude Sonnet via Bedrock (`sa-east-1`), módulo `ai/` com prompts versionados.
- **Seed:** script DuckDB lê `01_QueryA.csv.gz`, `03_QueryC.csv`, `04_Unidades.csv`, filtra 2025 e gera inserts.

```
[Browser] → [Next.js] → [Postgres]
                 │
                 └→ enqueue → [Redis/BullMQ] → [Worker] → [Kapso|Contele|Resend|Mock]
                                                    ▲
[Webhooks provedores] ─────────────────────────────┘
                 │
            [Claude/Bedrock] ← inbound WhatsApp
```

## 10. Integrações

| Canal | Provedor | Uso | Fallback |
|-------|----------|-----|----------|
| WhatsApp | Kapso (Cloud API oficial, sandbox) | Envio D0/D1, inbound, status | mock |
| SMS | Contele | D1/D2 | mock |
| E-mail | Resend | D2 | mock |
| IA | Claude Sonnet / Bedrock | Classificação, resumo, rascunho | regra por palavra-chave (SIM/NÃO) |

## 11. Regras de negócio

- Dias úteis: seg–sex, excluindo feriados municipais/estaduais/nacionais Rio 2026 (hardcoded).
- 1 tentativa por canal por dia, no máximo.
- Extensão: +1 dia útil, uma vez, só `cre`, justificativa obrigatória.
- Uma criança só pode ter uma convocação aberta por vez.
- Criança com `Confirmado` em qualquer unidade é inelegível.
- Régua de pontuação: somente leitura, carregada de Query C do ano do processo.

## 12. Seed

- Processo 195 (2025). Situações: `Lista de espera`, `Selecionado`, `Ativo`.
- 2 unidades para demo (escolher as com maior fila em bairros distintos) + 1 CRE.
- Nomes fictícios gerados (faker pt-BR) mapeados 1:1 a `aluno_anon`.
- Contatos: telefones dos membros do time, rotacionados.
- Pré-carregar 1 convocação já vencida e 1 inconsistência para a demo do painel.

## 13. Demo (6 min)

1. (0:00–1:00) Dor: fila de preferência, convocação manual, sem log. Números reais.
2. (1:00–3:30) Fila da unidade → abrir vaga → WhatsApp chega no celular ao vivo → responde "consigo só sexta" → Claude classifica `extensao` → CRE concede → timeline completa.
3. (3:30–4:30) Painel CRE: vaga parada há 4 dias, inconsistência, conversão por unidade.
4. (4:30–5:30) Arquitetura em 30s + como Claude atua.
5. (5:30–6:00) Hoje vs próximo: sandbox → templates Meta aprovados; integração ICH; ligação por voz; previsão territorial.

## 14. Riscos

| Risco | Mitigação |
|-------|-----------|
| Kapso sandbox falha na hora | Adapter mock + vídeo de 60s gravado antes |
| Meta bloqueia mensagem proativa | Sandbox na demo; declarar template aprovado como próximo passo |
| Deploy quebra | Rodar local com ngrok para webhooks |
| Régua/regra interpretada errado | Mostrar breakdown por critério e citar Query C |
| Tempo | Ordem de corte: painel → auth → Contele/Resend. Nunca cortar fila, convocação, Claude |

## 15. Entregáveis

- Repo público com README: nome da equipe, membros, resumo, arquitetura/como Claude atua, URL, vídeo 60s.
- App deployado.
- Vídeo 60s gravado até 15h30 (seguro).
- E-mail de submissão enviado até 16h15.

## 16. Divisão sugerida (4 pessoas)

| Pessoa | Blocos | Até |
|--------|--------|-----|
| A | Seed, modelo, fila viva, ficha | 13h |
| B | Worker, adapters, webhooks, máquina de estados | 13h30 |
| C | CRM (edição, timeline, notas), Claude | 14h |
| D | Painel CRE, auth, deploy, README, vídeo, pitch | 15h30 |

Integração final 14h–15h30. Congelar código 16h.
