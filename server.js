require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const app = express();
app.use(cors());
app.use(express.json());

const DB_PATH = path.join(__dirname, 'db.json');
const DEFAULT_DATA = { users: [], petitions: [] };

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
    return { users: data.users || [], petitions: data.petitions || [] };
  } catch {
    await fsp.writeFile(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
    return { ...DEFAULT_DATA };
  }
}

async function writeDB(data) {
  const out = JSON.stringify(data, null, 2);
  await fsp.writeFile(DB_PATH, out, 'utf8');
}

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'magic_admin_token';
app.use(express.static(path.join(__dirname, '/')));

app.get('/api/users', async (req, res) => {
  const token = req.headers['authorization'];
  if (token !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const db = await readDB();
  res.json(db.users);
});

app.get('/api/petitions', async (req, res) => {
  const token = req.headers['authorization'];
  if (token !== `Bearer ${ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const db = await readDB();
  res.json(db.petitions);
});

app.post('/api/signup', async (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ error: 'id and password required' });

  const db = await readDB();
  db.users.push({ id, password });
  await writeDB(db);
  res.json({ ok: true });
});

app.post('/api/petition', async (req, res) => {
  const { name, topic, content } = req.body || {};
  if (!name || !topic || !content) return res.status(400).json({ error: 'name, topic, content required' });

  const db = await readDB();
  db.petitions.unshift({
    name,
    topic,
    content,
    time: new Date().toLocaleString('ko-KR'),
  });
  await writeDB(db);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
ensureDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
