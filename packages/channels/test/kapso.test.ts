import { describe, expect, test } from 'bun:test';
import { kapso } from '../src/kapso.ts';

const canal = kapso();

describe('webhook do WhatsApp no formato da Kapso', () => {
  test('resposta digitada vira inbound com o telefone de quem escreveu', () => {
    const [r] = canal.parseWebhook({
      conversation: { phone_number: '+55 21 99999-0001' },
      event: 'whatsapp.message.received',
      message: { id: 'wamid.1', text: { body: 'consigo so na sexta' }, type: 'text' },
    });
    expect(r?.status).toBe('respondido');
    expect(r?.inbound?.texto).toBe('consigo so na sexta');
    expect(r?.inbound?.remetente).toBe('5521999990001');
  });

  test('botão do template também vira inbound', () => {
    const [r] = canal.parseWebhook({
      conversation: { phone_number: '5521999990001' },
      event: 'whatsapp.message.received',
      message: {
        button: { payload: 'sim', text: 'Confirmo a vaga' },
        id: 'wamid.2',
        type: 'button',
      },
    });
    expect(r?.inbound?.texto).toBe('Confirmo a vaga');
  });

  test('entrega e falha viram atualização de status', () => {
    const [entregue] = canal.parseWebhook({
      event: 'whatsapp.message.delivered',
      message: { id: 'wamid.3' },
    });
    expect(entregue).toEqual({ providerId: 'wamid.3', status: 'entregue' });

    const [falhou] = canal.parseWebhook({
      event: 'whatsapp.message.failed',
      message: { id: 'wamid.4' },
    });
    expect(falhou?.status).toBe('falhou');
  });

  test('evento sem mensagem não gera nada', () => {
    expect(canal.parseWebhook({ event: 'whatsapp.conversation.created' })).toHaveLength(0);
    expect(canal.parseWebhook(null)).toHaveLength(0);
  });
});

describe('webhook no formato cru da Meta', () => {
  test('status e resposta convivem no mesmo evento', () => {
    const saida = canal.parseWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { context: { id: 'wamid.9' }, from: '5521999990001', text: { body: 'sim' } },
                ],
                statuses: [{ id: 'wamid.10', status: 'read' }],
              },
            },
          ],
        },
      ],
    });
    expect(saida).toHaveLength(2);
    expect(saida[0]?.status).toBe('lido');
    expect(saida[1]?.inbound?.texto).toBe('sim');
    expect(saida[1]?.providerId).toBe('wamid.9');
  });
});
