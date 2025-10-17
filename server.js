require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const DB_PATH = path.join(__dirname, 'db.json');
const DEFAULT_DATA = { users: [], petitions: [], sessions: [] };

async function ensureDB() {
  try {
    await fsp.access(DB_PATH, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
  }
}

async function readDB() {
  await ensureDB();
  const raw = await fsp.readFile(DB_PATH, 'utf8');
  try {
    const data = JSON.parse(raw);
    return {
      users: data.users || [],
      petitions: data.petitions || [],
      sessions: data.sessions || [],
    };
  } catch {
    await fsp.writeFile(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
    return { ...DEFAULT_DATA };
  }
}

async function writeDB(data) {
  const out = JSON.stringify(data, null, 2);
  await fsp.writeFile(DB_PATH, out, 'utf8');
}

app.use(express.static(path.join(__dirname, '/')));

const AUTH_TOKEN_HEADER = 'authorization';

const sanitizeUser = user => ({ id: user.id, role: user.role || 'user' });

const createSession = (db, user) => {
  const token = crypto.randomUUID();
  const session = {
    token,
    userId: user.id,
    role: user.role || 'user',
    createdAt: new Date().toISOString(),
  };

  db.sessions = db.sessions.filter(entry => entry.userId !== user.id);
  db.sessions.push(session);

  return session;
};

const authenticate = async (req, res, next) => {
  const header = req.headers[AUTH_TOKEN_HEADER];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.slice('Bearer '.length).trim();
  const db = await readDB();
  const session = db.sessions.find(entry => entry.token === token);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.session = session;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.session?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
};

app.get('/api/users/public', async (req, res) => {
  const db = await readDB();
  res.json(db.users.map(user => ({ id: user.id })));
});

app.post('/api/signup', async (req, res) => {
  const { id, password } = req.body || {};
  const trimmedId = typeof id === 'string' ? id.trim() : '';
  const trimmedPassword = typeof password === 'string' ? password.trim() : '';

  if (!trimmedId || !trimmedPassword) {
    return res.status(400).json({ error: 'id and password required' });
  }

  const db = await readDB();
  if (db.users.find(user => user.id === trimmedId)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  const role = trimmedId.toLowerCase() === 'admin' ? 'admin' : 'user';
  db.users.push({ id: trimmedId, password: trimmedPassword, role });
  await writeDB(db);

  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { id, password } = req.body || {};
  const trimmedId = typeof id === 'string' ? id.trim() : '';
  const trimmedPassword = typeof password === 'string' ? password.trim() : '';

  if (!trimmedId || !trimmedPassword) {
    return res.status(400).json({ error: 'id and password required' });
  }

  const db = await readDB();
  const user = db.users.find(entry => entry.id === trimmedId && entry.password === trimmedPassword);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const session = createSession(db, user);
  await writeDB(db);

  res.json({
    token: session.token,
    user: sanitizeUser(user),
  });
});

app.get('/api/me', authenticate, async (req, res) => {
  const db = await readDB();
  const user = db.users.find(entry => entry.id === req.session.userId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(sanitizeUser(user));
});

app.get('/api/petitions', authenticate, async (req, res) => {
  const db = await readDB();
  res.json(db.petitions);
});

app.post('/api/petition', authenticate, async (req, res) => {
  const { name, topic, content } = req.body || {};
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedTopic = typeof topic === 'string' ? topic.trim() : '';
  const trimmedContent = typeof content === 'string' ? content.trim() : '';

  if (!trimmedName || !trimmedTopic || !trimmedContent) {
    return res.status(400).json({ error: 'name, topic, content required' });
  }

  const db = await readDB();
  db.petitions.unshift({
    name: trimmedName,
    topic: trimmedTopic,
    content: trimmedContent,
    timestamp: new Date().toISOString(),
    createdBy: req.session.userId,
  });
  await writeDB(db);

  res.json({ ok: true });
});

app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  const db = await readDB();
  res.json(db.users);
});

app.get('/api/admin/petitions', authenticate, requireAdmin, async (req, res) => {
  const db = await readDB();
  res.json(db.petitions);
});

const PORT = process.env.PORT || 3000;
ensureDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
