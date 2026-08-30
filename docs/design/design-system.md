# Fila Viva — Design System

CRM de fila e convocação de creche · Prefeitura do Rio de Janeiro / SME · processo 195/2025.
Baseado em `uploads/PRD-crm-convocacao-creche.md`.

## Arquivos
- `Design System.dc.html` — fundações visuais: cor, tipografia, situações da opção (máquina de estados), componentes, espaço/raio, regras de escrita.
- `Plataforma.dc.html` — as três telas do produto: fila da unidade, ficha da criança (contato versionado, timeline, bloco de IA) e painel CRE.
- `tokens.css` — custom properties para o app Next.js/Tailwind.

## Princípios
1. **Prazo em primeiro plano.** A tela existe para responder "há quanto tempo essa vaga está Selecionada". Prazo em mono, cor semântica, sempre antes do resto.
2. **Densidade legível.** Retaguarda: tabela sem zebra, divisores finos, 13–13,5px de corpo. Nada de card decorativo.
3. **Dado imutável parece imutável.** Pontuação, posição e respostas socioeconômicas em estado desabilitado explícito, não escondidas.
4. **Auditoria visível.** Toda mutação mostra autor e timestamp na timeline; motivo é campo obrigatório.
5. **IA atribuída e aprovável.** Violeta = Claude. Sempre com confiança, trecho-chave e botão de aprovação. Nunca muda situação sozinho.
6. **Assinatura institucional em tipografia.** Nenhum brasão da Prefeitura foi reproduzido — a assinatura é texto em amarelo cívico sobre ink. Se o time tiver o arquivo oficial do brasão, substituir no cabeçalho da barra lateral.

## Cor por situação
| Situação | Fundo | Texto |
|---|---|---|
| Lista de espera | `#E6EEF6` | `#14568F` |
| Convocado | `#FAEFD8` | `#8A5A00` |
| Confirmado / Ativo | `#E5F1EA` | `#1D6B4B` |
| Cancelado pelo sistema | `#FAE6E3` | `#A32218` |
| Cancelado na confirmacao | `#F1EFEA` | `#4A5663` |

## Canais na timeline
`WHATSAPP` `SMS` `E-MAIL` `MANUAL` `STATUS` `INBOUND` — rótulo em mono caixa alta, cor pelo status da tentativa (entregue verde, falhou vermelho, manual/status neutro ou âmbar, inbound violeta).

## Tipografia
IBM Plex Sans (400/500/600) para nomes, títulos e corpo. IBM Plex Mono (400/500) para todo número conferível: pontuação, prazo, códigos, taxas, rótulos de coluna. Sem ícones decorativos — rótulos de canal são texto.

## Pendências
- Brasão/assinatura oficial da Prefeitura (arquivo vetorial) não fornecido.
- Fonte institucional oficial, se houver, substitui IBM Plex.
