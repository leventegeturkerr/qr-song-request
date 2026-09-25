require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(16).toString('hex');

// ---------- basit dosya tabanlı veritabanı ----------
function loadData() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ requests: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
let db = loadData();

// ---------- IP başına basit hız sınırlama (spam engelleme) ----------
const lastAction = new Map();
function rateLimited(ip, minGapMs = 4000) {
  const now = Date.now();
  const last = lastAction.get(ip) || 0;
  if (now - last < minGapMs) return true;
  lastAction.set(ip, now);
  return false;
}

const app = express();
const serverHttp = http.createServer(app);
const io = new Server(serverHttp);

app.set('trust proxy', 1); // ters proxy arkasında (Nginx, Render, Railway vb.) gerçek IP için
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 } // 12 saat
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// ---------- yönetici girişi ----------
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Şifre yanlış' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ---------- şarkı istekleri ----------
function publicList() {
  return db.requests.slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === 'played' ? 1 : -1;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.createdAt - b.createdAt;
  });
}

app.get('/api/requests', (req, res) => {
  res.json(publicList());
});

app.post('/api/requests', (req, res) => {
  const ip = req.ip;
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Çok hızlı gönderim, birkaç saniye bekle.' });
  }
  const { song, artist, requester, table } = req.body;
  if (!song || !song.trim()) {
    return res.status(400).json({ error: 'Şarkı adı gerekli' });
  }
  const key = (s, a) => (s || '').trim().toLowerCase() + '|' + (a || '').trim().toLowerCase();
  const normalized = key(song, artist);

  const existing = db.requests.find(
    (r) => r.status === 'pending' && key(r.song, r.artist) === normalized
  );

  if (existing) {
    if (!existing.votedIps.includes(ip)) {
      existing.votes += 1;
      existing.votedIps.push(ip);
      saveData(db);
      io.emit('requests:update', publicList());
    }
    return res.json(existing);
  }

  const newReq = {
    id: crypto.randomUUID(),
    song: song.trim().slice(0, 80),
    artist: (artist || '').trim().slice(0, 60),
    requester: (requester || '').trim().slice(0, 40),
    table: (table || '').trim().slice(0, 20),
    votes: 1,
    votedIps: [ip],
    status: 'pending', // pending | played
    createdAt: Date.now(),
  };
  db.requests.push(newReq);
  saveData(db);
  io.emit('requests:update', publicList());
  res.status(201).json(newReq);
});

app.post('/api/requests/:id/vote', (req, res) => {
  const ip = req.ip;
  const item = db.requests.find((r) => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Bulunamadı' });
  if (item.votedIps.includes(ip)) {
    return res.status(409).json({ error: 'Bu isteğe zaten oy verdin' });
  }
  item.votes += 1;
  item.votedIps.push(ip);
  saveData(db);
  io.emit('requests:update', publicList());
  res.json(item);
});

// sadece yönetici: durum güncelle (çalındı işaretle / geri al)
app.patch('/api/requests/:id', requireAuth, (req, res) => {
  const item = db.requests.find((r) => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Bulunamadı' });
  if (req.body.status) item.status = req.body.status;
  saveData(db);
  io.emit('requests:update', publicList());
  res.json(item);
});

// sadece yönetici: tek isteği sil
app.delete('/api/requests/:id', requireAuth, (req, res) => {
  db.requests = db.requests.filter((r) => r.id !== req.params.id);
  saveData(db);
  io.emit('requests:update', publicList());
  res.json({ ok: true });
});

// sadece yönetici: çalınmış olanları toplu temizle
app.post('/api/requests/clear-played', requireAuth, (req, res) => {
  db.requests = db.requests.filter((r) => r.status !== 'played');
  saveData(db);
  io.emit('requests:update', publicList());
  res.json({ ok: true });
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

io.on('connection', (socket) => {
  socket.emit('requests:update', publicList());
});

serverHttp.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
