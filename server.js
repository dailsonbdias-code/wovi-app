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

// Rotas de página
app.get('/home', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Wovi backend rodando na porta ${PORT}`));
