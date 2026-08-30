# Canais externos

Cada canal implementa `send()` e `parseWebhook()`. O adapter `mock` funciona sem chave
nenhuma e escreve a mensagem no log do worker — é ele que sustenta a demonstração.

## WhatsApp (Kapso)

Endereço: `https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages`,
cabeçalho `X-API-Key`, corpo no formato da Meta. A Kapso é um proxy: quem valida o
payload é a Cloud API.

```
CANAL_WHATSAPP=kapso
KAPSO_API_KEY=...
KAPSO_PHONE_NUMBER_ID=...
KAPSO_TEMPLATE_CONVOCACAO=fila_viva_convocacao   # opcional
```

Fora da janela de 24 horas a Meta só entrega template aprovado. Sem
`KAPSO_TEMPLATE_CONVOCACAO` o adapter manda texto livre, que só chega se a família
escreveu para a unidade nas últimas 24 horas. Em uso está o
`fila_viva_convocacao_v2`, com os botões "Confirmo a vaga" e "Não quero a vaga" — a
resposta por botão chega no webhook como texto e segue o mesmo caminho da digitada. O template de convocação recebe cinco
valores, nesta ordem: nome da criança, unidade, turno, grupamento e prazo.

### Webhook

O endereço público é o próprio front, que repassa para a API:
`https://<dominio>/api/webhooks/kapso?token=<WEBHOOK_TOKEN>`. Não precisa de domínio
separado para a API.

A Kapso assina o corpo em HMAC-SHA256 e manda no cabeçalho `X-Webhook-Signature`. A rota
confere a assinatura sobre os bytes crus, com comparação de tempo constante, antes de
interpretar o JSON. Sem `KAPSO_WEBHOOK_SECRET` configurado, a barreira volta a ser só o
token — bom para desenvolvimento, não para produção.

Dois formatos são aceitos: o da Kapso (`event` + `message` + `conversation`) e o cru da
Meta (`entry` → `changes`). O primeiro é o que a Kapso manda por padrão e traz o telefone
de quem escreveu, que é como a resposta encontra a convocação.

### Como a resposta encontra a convocação

A família quase nunca responde citando a mensagem original, então o webhook chega sem o id
da mensagem. Quando não há tentativa correspondente, o sistema procura a convocação aberta
pelo telefone de quem escreveu, comparando os últimos oito dígitos — o que sobrevive ao
nono dígito, ao DDI e à formatação de cada provedor.

## SMS (Comtele)

Duas gerações de API convivem e a chave só vale numa delas. `CONTELE_API_VERSAO`
escolhe; o padrão é a nova.

**Nova** (padrão): `POST https://api.comtele.com.br/messages/sms/batch/send`, cabeçalho
`x-api-key`, corpo com `messages`, `route`, `tag` e `custom`. O envio individual responde
sem id nenhum — só o lote devolve `object.requestId`, que é o que permite cruzar com o
relatório depois.

A `route` é obrigatória e é da conta: sem ela o envio volta com "a rota informada não está
cadastrada para o usuário", que não parece erro de rota faltando. Listar com
`curl -H "x-api-key: $CONTELE_API_KEY" https://api.comtele.com.br/routes`.

Duas coisas que custam dinheiro: acento vira caractere de 2 bytes e dobra o custo por
mensagem, então o texto vai sem acento; e o telefone precisa de DDI sem o zero de
discagem, senão o número não é encontrado.

**v2** (legada): `POST https://sms.comtele.com.br/api/v2/send`, cabeçalho `auth-key`, corpo
com `Content`, `Receivers` e `Sender`. O `Sender` é o identificador que volta no webhook,
não o remetente.

O webhook chega em dois formatos: com `ReceivedContent` é resposta da família; sem ele,
é atualização de status, em `Status`.

```
CANAL_SMS=contele
CONTELE_API_KEY=...
CONTELE_ROUTE_ID=17
```

## E-mail (Resend)

`POST https://api.resend.com/emails` com `Authorization: Bearer`. O webhook traz o id em
`data.email_id` e os eventos `email.sent`, `email.delivered`, `email.opened`,
`email.bounced`, `email.failed` e `email.complained`.

A Resend assina os webhooks pelo padrão Svix, nos cabeçalhos `svix-id`,
`svix-timestamp` e `svix-signature`. **A verificação ainda não está implementada** — hoje
a barreira é o token na URL. Antes de expor o webhook em produção, verificar a assinatura
com o corpo cru, como a documentação exige.

```
CANAL_EMAIL=resend
RESEND_API_KEY=...
EMAIL_FROM=fila-viva@seudominio
```
