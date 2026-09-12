// Wovi — Backend real (autenticação + dados persistentes em arquivo)
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));

function readData() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
function writeData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

// Sessões em memória — token aleatório -> e-mail do usuário
const sessions = {};

function getUserFromRequest(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  const email = sessions[token];
  if (!email) return null;
  const data = readData();
  const user = data.users[email];
  if (!user) return null;
  return { email, name: user.name, role: user.role };
}

// Existe alguém cadastrado ainda? (define se a tela mostra login ou criar conta)
app.get('/api/has-users', (req, res) => {
  const data = readData();
  res.json({ hasUsers: Object.keys(data.users).length > 0 });
});

app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Preencha todos os campos.' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });

  const data = readData();
  const key = email.trim().toLowerCase();
  if (data.users[key]) return res.status(400).json({ error: 'Esse e-mail já está cadastrado.' });

  const isFirstUser = Object.keys(data.users).length === 0;
  data.users[key] = {
    name: name.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: isFirstUser ? 'admin' : 'atendente',
    createdAt: new Date().toISOString(),
  };
  writeData(data);

  const token = crypto.randomBytes(24).toString('hex');
  sessions[token] = key;
  res.json({ token, name: data.users[key].name, role: data.users[key].role });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Preencha e-mail e senha.' });

  const data = readData();
  const key = email.trim().toLowerCase();
  const user = data.users[key];
  if (!user) return res.status(400).json({ error: 'E-mail não encontrado.' });
  if (!bcrypt.compareSync(password, user.passwordHash)) return res.status(400).json({ error: 'Senha incorreta.' });

  const token = crypto.randomBytes(24).toString('hex');
  sessions[token] = key;
  res.json({ token, name: user.name, role: user.role });
});

app.get('/api/me', (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Não autenticado.' });
  res.json(user);
});

app.post('/api/logout', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  delete sessions[token];
  res.json({ ok: true });
});

// ---------- Webhook do WhatsApp (Meta / BSP) ----------
const WHATSAPP_DATA_FILE = path.join(DATA_DIR, 'whatsapp-messages.json');
if (!fs.existsSync(WHATSAPP_DATA_FILE)) fs.writeFileSync(WHATSAPP_DATA_FILE, JSON.stringify({ messages: [] }, null, 2));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'wovi-verify-2026';

// Passo 1: verificação (a Meta chama isso uma vez, ao configurar a URL do webhook)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook do WhatsApp verificado com sucesso.');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Passo 2: recebimento de mensagens de verdade
app.post('/webhook', (req, res) => {
  const payload = req.body;
  console.log('Mensagem do WhatsApp recebida:', JSON.stringify(payload));

  try {
    const data = JSON.parse(fs.readFileSync(WHATSAPP_DATA_FILE, 'utf-8'));
    data.messages.unshift({ receivedAt: new Date().toISOString(), payload });
    data.messages = data.messages.slice(0, 100);
    fs.writeFileSync(WHATSAPP_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Erro ao salvar mensagem do WhatsApp', e);
  }

  res.sendStatus(200);
});

// Página simples pra ver as últimas mensagens recebidas (debug)
app.get('/webhook-debug', (req, res) => {
  const data = JSON.parse(fs.readFileSync(WHATSAPP_DATA_FILE, 'utf-8'));
  const rows = data.messages.map(m => `
    <div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:10px;font-family:monospace;font-size:12px;">
      <div style="color:#888;">${m.receivedAt}</div>
      <pre style="white-space:pre-wrap;margin:6px 0 0;">${JSON.stringify(m.payload, null, 2)}</pre>
    </div>`).join('');
  res.send(`<html><head><meta charset="utf-8"><title>Wovi — Debug WhatsApp</title></head>
    <body style="font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 16px;">
    <h2>🔌 Mensagens recebidas do WhatsApp</h2>
    <p>Total: ${data.messages.length}</p>${rows || '<p>Nenhuma mensagem ainda.</p>'}</body></html>`);
});

// Rotas de página
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Wovi backend rodando na porta ${PORT}`));
