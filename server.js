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
const ADMIN_SEED = {
  id: 'admin',
  password: 'admin123',
  role: 'admin',
  createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
};

async function ensureDB() {
  try {
    await fsp.access(DB_PATH, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(DB_PATH, `${JSON.stringify(DEFAULT_DATA, null, 2)}\n`, 'utf8');
  }
}

async function readDB() {
  await ensureDB();
  const raw = await fsp.readFile(DB_PATH, 'utf8');

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    console.error('데이터베이스를 파싱하지 못했습니다. 초기화합니다.', error);
    await fsp.writeFile(DB_PATH, `${JSON.stringify(DEFAULT_DATA, null, 2)}\n`, 'utf8');
    data = { ...DEFAULT_DATA };
  }

  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.petitions)) data.petitions = [];
  if (!Array.isArray(data.sessions)) data.sessions = [];

  const hasAdmin = data.users.some(user => user.role === 'admin');
  if (!hasAdmin) {
    data.users.push({ ...ADMIN_SEED });
    await writeDB(data);
  }

  return data;
}

async function writeDB(data) {
  const output = `${JSON.stringify(data, null, 2)}\n`;
  await fsp.writeFile(DB_PATH, output, 'utf8');
}

function sanitizeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

function generateToken() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(32).toString('hex');
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const db = await readDB();
    const session = db.sessions.find(entry => entry.token === token);
    if (!session) {
      return res.status(401).json({ error: '세션이 유효하지 않습니다.' });
    }

    const user = db.users.find(entry => entry.id === session.userId);
    if (!user) {
      db.sessions = db.sessions.filter(entry => entry.token !== token);
      await writeDB(db);
      return res.status(401).json({ error: '계정을 확인할 수 없습니다.' });
    }

    req.db = db;
    req.auth = { token, user };
    return next();
  } catch (error) {
    console.error('인증 중 오류가 발생했습니다.', error);
    return res.status(500).json({ error: '인증을 처리하지 못했습니다.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.user.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  return next();
}

app.use(express.static(path.join(__dirname, '/')));

app.get('/api/signup/roster', async (req, res) => {
  try {
    const db = await readDB();
    const users = db.users
      .filter(user => user.role !== 'admin')
      .map(sanitizeUser)
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
    res.json({ users });
  } catch (error) {
    console.error('가입자 목록을 불러오지 못했습니다.', error);
    res.status(500).json({ error: '가입자 목록을 불러오지 못했습니다.' });
  }
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
    const exists = db.users.some(user => user.id === trimmedId);

    if (exists) {
      return res.status(409).json({ error: '이미 등록된 아이디입니다.' });
    }

    const createdAt = new Date().toISOString();
    db.users.push({ id: trimmedId, password: trimmedPassword, role: 'user', createdAt });
    await writeDB(db);

    return res.status(201).json({ user: { id: trimmedId, createdAt } });
  } catch (error) {
    console.error('회원가입 저장 중 오류가 발생했습니다.', error);
    return res.status(500).json({ error: '회원가입 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { id, password } = req.body || {};

  if (typeof id !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: '아이디와 비밀번호를 모두 입력해주세요.' });
  }

  try {
    const db = await readDB();
    const user = db.users.find(entry => entry.id === id.trim());

    if (!user || user.password !== password) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const token = generateToken();
    const createdAt = new Date().toISOString();

    db.sessions = db.sessions.filter(entry => entry.userId !== user.id);
    db.sessions.push({ token, userId: user.id, createdAt });
    await writeDB(db);

    return res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('로그인 처리 중 오류가 발생했습니다.', error);
    return res.status(500).json({ error: '로그인을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

app.get('/api/me', authenticate, (req, res) => {
  res.json({ user: sanitizeUser(req.auth.user) });
});

app.post('/api/logout', authenticate, async (req, res) => {
  try {
    const { token } = req.auth;
    req.db.sessions = req.db.sessions.filter(entry => entry.token !== token);
    await writeDB(req.db);
    res.json({ ok: true });
  } catch (error) {
    console.error('로그아웃 처리 중 오류가 발생했습니다.', error);
    res.status(500).json({ error: '로그아웃을 처리하지 못했습니다.' });
  }
});

app.post('/api/petition', authenticate, async (req, res) => {
  const { name, topic, content } = req.body || {};

  if (typeof topic !== 'string' || typeof content !== 'string') {
    return res.status(400).json({ error: '민원 내용을 정확히 입력해주세요.' });
  }

  const trimmedName = typeof name === 'string' && name.trim() ? name.trim() : req.auth.user.id;
  const trimmedTopic = topic.trim();
  const trimmedContent = content.trim();

  if (!trimmedTopic || !trimmedContent) {
    return res.status(400).json({ error: '모든 필드를 올바르게 입력해주세요.' });
  }

  try {
    const timestamp = new Date().toISOString();
    req.db.petitions.unshift({
      name: trimmedName,
      topic: trimmedTopic,
      content: trimmedContent,
      timestamp,
      userId: req.auth.user.id,
    });
    await writeDB(req.db);
    res.status(201).json({ petition: { name: trimmedName, topic: trimmedTopic, content: trimmedContent, timestamp } });
  } catch (error) {
    console.error('민원 저장 중 오류가 발생했습니다.', error);
    res.status(500).json({ error: '민원을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

app.get('/api/petitions', authenticate, async (req, res) => {
  try {
    const db = req.db || (await readDB());
    const petitions = db.petitions.map(petition => ({
      name: petition.name,
      topic: petition.topic,
      content: petition.content,
      timestamp: petition.timestamp,
    }));
    res.json({ petitions });
  } catch (error) {
    console.error('민원 목록을 불러오지 못했습니다.', error);
    res.status(500).json({ error: '민원 목록을 불러오지 못했습니다.' });
  }
});

app.get('/api/admin/overview', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = req.db;
    const users = db.users.map(user => ({
      id: user.id,
      role: user.role,
      createdAt: user.createdAt,
      password: user.password,
    }));
    const petitions = db.petitions.map(petition => ({ ...petition }));
    res.json({ users, petitions });
  } catch (error) {
    console.error('관리자 데이터를 불러오지 못했습니다.', error);
    res.status(500).json({ error: '관리자 데이터를 불러오지 못했습니다.' });
  }
});

const PORT = process.env.PORT || 3000;
ensureDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
