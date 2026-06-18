const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'attendance.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { members: [], attendance: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}

function normalizeAttendanceShape(obj) {
  // Ensure attendance[date] is { attendees: [], guests: [] }
  obj.attendance = obj.attendance || {};
  for (const d of Object.keys(obj.attendance)) {
    const v = obj.attendance[d];
    if (Array.isArray(v)) {
      obj.attendance[d] = { attendees: v.slice(), guests: [] };
    } else {
      obj.attendance[d].attendees = obj.attendance[d].attendees || [];
      obj.attendance[d].guests = obj.attendance[d].guests || [];
    }
  }
}

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const obj = JSON.parse(raw);
  normalizeAttendanceShape(obj);
  return obj;
}

function writeData(obj) {
  normalizeAttendanceShape(obj);
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
}

app.get('/api/data', (req, res) => {
  res.json(readData());
});

app.post('/api/members', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const data = readData();
  if (!data.members.includes(name)) {
    data.members.push(name);
    data.members.sort((a,b)=>a.localeCompare(b));
    writeData(data);
  }
  res.json(data);
});

app.delete('/api/members', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const data = readData();
  data.members = data.members.filter(n => n !== name);
  writeData(data);
  res.json(data);
});

app.post('/api/attendance', (req, res) => {
  const { date, name, present, guest } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  const data = readData();
  const rec = data.attendance[date] || { attendees: [], guests: [] };

  if (guest && guest.name) {
    // add guest for the date
    const g = { name: (guest.name||'').trim(), email: (guest.email||'').trim(), phone: (guest.phone||'').trim() };
    if (!g.name) return res.status(400).json({ error: 'guest name required' });
    rec.guests = rec.guests || [];
    rec.guests.push(g);
    data.attendance[date] = rec;
    writeData(data);
    return res.json({ date, guests: rec.guests });
  }

  if (!name) return res.status(400).json({ error: 'name required' });
  rec.attendees = rec.attendees || [];
  if (present) {
    if (!rec.attendees.includes(name)) rec.attendees.push(name);
  } else {
    const idx = rec.attendees.indexOf(name);
    if (idx !== -1) rec.attendees.splice(idx,1);
  }
  rec.attendees.sort((a,b)=>a.localeCompare(b));
  data.attendance[date] = rec;
  writeData(data);
  res.json({ date, attendees: rec.attendees });
});

app.delete('/api/attendance/guest', (req, res) => {
  const { date, name } = req.body;
  if (!date || !name) return res.status(400).json({ error: 'date and name required' });
  const data = readData();
  const rec = data.attendance[date] || { attendees: [], guests: [] };
  rec.guests = (rec.guests || []).filter(g => g.name !== name);
  data.attendance[date] = rec;
  writeData(data);
  res.json({ date, guests: rec.guests });
});

app.post('/api/import', (req, res) => {
  const names = req.body.names || [];
  if (!Array.isArray(names)) return res.status(400).json({ error: 'names array required' });
  const data = readData();
  for (let n of names) {
    n = (n||'').trim();
    if (!n) continue;
    if (!data.members.includes(n)) data.members.push(n);
  }
  data.members.sort((a,b)=>a.localeCompare(b));
  writeData(data);
  res.json(data);
});

app.get('/api/export', (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).send('date query required (YYYY-MM-DD)');
  const data = readData();
  const members = (data.members || []).slice().sort((a,b)=>a.localeCompare(b));
  const rec = data.attendance[date] || { attendees: [], guests: [] };
  const attendees = new Set(rec.attendees || []);
  let csv = 'Name,Email,Phone,Present\n';
  for (const m of members) {
    csv += `${m},, ,${attendees.has(m) ? '1' : '0'}\n`;
  }
  // append guests
  for (const g of (rec.guests || [])) {
    csv += `${g.name},${g.email || ''},${g.phone || ''},1\n`;
  }
  const filename = `attendance-${date}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

const server = app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Choir attendance app listening on http://localhost:${PORT}`);
});

module.exports = server;
