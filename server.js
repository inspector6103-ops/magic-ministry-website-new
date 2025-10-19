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

  if (typeof id !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: '아이디와 비밀번호를 정확히 입력해주세요.' });
  }

  const trimmedId = id.trim();
  const trimmedPassword = password.trim();

  if (!trimmedId || !trimmedPassword) {
    return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
  }

  if (trimmedId.length < 3) {
    return res.status(400).json({ error: '아이디는 3자 이상 입력해주세요.' });
  }

  if (trimmedPassword.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상 입력해주세요.' });
  }

  try {
    const db = await readDB();

    if (db.users.some(user => user.id === trimmedId)) {
      return res.status(409).json({ error: '이미 등록된 아이디입니다.' });
    }

    const createdAt = new Date().toISOString();
    db.users.push({ id: trimmedId, password: trimmedPassword, createdAt });
    await writeDB(db);

    return res.status(201).json({
      user: { id: trimmedId, createdAt },
    });
  } catch (error) {
    console.error('회원가입 저장 중 오류가 발생했습니다.', error);
    return res.status(500).json({ error: '회원가입 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
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
