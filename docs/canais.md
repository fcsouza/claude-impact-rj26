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
escreveu para a unidade nas últimas 24 horas. O template de convocação recebe cinco
valores, nesta ordem: nome da criança, unidade, turno, grupamento e prazo.

## SMS (Comtele)

API v2: `POST https://sms.comtele.com.br/api/v2/send`, cabeçalho `auth-key`, corpo com
`Content`, `Receivers` e `Sender`. O campo `Sender` é o identificador que volta no
webhook — não é o remetente. A resposta traz `Object.requestUniqueId`.

O webhook chega em dois formatos: com `ReceivedContent` é resposta da família; sem ele,
é atualização de status, em `Status`.

```
CANAL_SMS=contele
CONTELE_API_KEY=...
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
