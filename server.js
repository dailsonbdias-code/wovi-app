// Wovi — Ponte de teste com o WhatsApp
// Recebe mensagens do BSP (360dialog/Gupshup) ou da Meta diretamente,
// guarda as últimas em memória, e mostra numa página simples.

const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Troque isso depois por um valor seu — usado na verificação do webhook (passo da Meta/BSP)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'wovi-teste-123';

// Guarda as últimas 50 mensagens recebidas (em memória — reinicia se o servidor reiniciar)
let receivedMessages = [];

// 1. Verificação do webhook (a Meta/BSP chama isso uma vez, no momento de configurar a URL)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado com sucesso.');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2. Recebimento de mensagens de verdade
app.post('/webhook', (req, res) => {
  const payload = req.body;
  console.log('Mensagem recebida:', JSON.stringify(payload, null, 2));

  receivedMessages.unshift({
    receivedAt: new Date().toISOString(),
    payload,
  });
  receivedMessages = receivedMessages.slice(0, 50);

  // Responde rápido — a Meta espera 200 OK em poucos segundos
  res.sendStatus(200);
});

// 3. Página simples pra você ver se está chegando algo
app.get('/', (req, res) => {
  const rows = receivedMessages.map(m => `
    <div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:10px;font-family:monospace;">
      <div style="color:#888;font-size:12px;">${m.receivedAt}</div>
      <pre style="white-space:pre-wrap;margin:6px 0 0;">${JSON.stringify(m.payload, null, 2)}</pre>
    </div>
  `).join('');

  res.send(`
    <html>
    <head><meta charset="utf-8"><title>Wovi — Teste de Webhook</title></head>
    <body style="font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 16px;">
      <h2>🔌 Wovi — Ponte de teste com o WhatsApp</h2>
      <p>Status: <strong style="color:green;">no ar</strong></p>
      <p>Mensagens recebidas: <strong>${receivedMessages.length}</strong></p>
      <hr>
      ${rows || '<p style="color:#888;">Nenhuma mensagem recebida ainda.</p>'}
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
