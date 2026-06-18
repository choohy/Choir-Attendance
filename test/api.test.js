const { expect } = require('chai');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

const server = require('../server');

const DATA_FILE = path.join(__dirname, '..', 'data', 'attendance.json');

describe('Choir Attendance API', function() {
  this.timeout(5000);
  let backup;
  const today = new Date().toISOString().slice(0,10);

  before(() => {
    backup = fs.readFileSync(DATA_FILE, 'utf8');
    fs.writeFileSync(DATA_FILE, JSON.stringify({ members: [], attendance: {} }, null, 2));
  });

  after((done) => {
    fs.writeFileSync(DATA_FILE, backup, 'utf8');
    // close server
    try { server.close(done); } catch (e) { done(); }
  });

  it('imports names of guests', async () => {
    const res = await request(server).post('/api/import').send({ names: ['Import One', 'Import Two'] }).expect(200);
    expect(res.body.members).to.include('Import One');
    expect(res.body.members).to.include('Import Two');
  });

  it('adds a member and marks attendance', async () => {
    await request(server).post('/api/members').send({ name: 'Member A' }).expect(200);
    await request(server).post('/api/attendance').send({ date: today, name: 'Member A', present: true }).expect(200);
    const data = (await request(server).get('/api/data')).body;
    expect(data.attendance[today].attendees).to.include('Member A');
  });

  it('undo attendance', async () => {
    await request(server).post('/api/attendance').send({ date: today, name: 'Member A', present: false }).expect(200);
    const data = (await request(server).get('/api/data')).body;
    expect(data.attendance[today].attendees).to.not.include('Member A');
  });

  it('ensures attendance is marked against today\'s date', async () => {
    await request(server).post('/api/members').send({ name: 'Member B' }).expect(200);
    await request(server).post('/api/attendance').send({ date: today, name: 'Member B', present: true }).expect(200);
    const data = (await request(server).get('/api/data')).body;
    expect(Object.keys(data.attendance)).to.include(today);
    expect(data.attendance[today].attendees).to.include('Member B');
  });

  it('adds guest details for the night', async () => {
    const guest = { name: 'Guest X', email: 'guestx@example.com', phone: '555-0101' };
    const res = await request(server).post('/api/attendance').send({ date: today, guest }).expect(200);
    const data = (await request(server).get('/api/data')).body;
    const g = data.attendance[today].guests.find(x => x.name === guest.name);
    expect(g).to.exist;
    expect(g.email).to.equal(guest.email);
  });

  it('exports attendance CSV including guests', async () => {
    const res = await request(server).get('/api/export').query({ date: today }).expect(200);
    expect(res.headers['content-type']).to.include('text/csv');
    expect(res.text).to.include('Guest X');
  });
});
