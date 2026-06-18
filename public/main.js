async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.headers.get('content-type') && res.headers.get('content-type').includes('application/json') ? res.json() : res.text();
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  d.setMinutes(d.getMinutes() - off);
  return d.toISOString().slice(0,10);
}

let data = null;

async function load() {
  data = await api('/api/data');
  const dateInput = document.getElementById('date');
  if (!dateInput.value) dateInput.value = todayISO();
  renderRoster();
}

function renderRoster() {
  const roster = document.getElementById('roster');
  roster.innerHTML = '';
  const date = document.getElementById('date').value;
  const rec = (data.attendance && data.attendance[date]) || { attendees: [], guests: [] };
  const attendees = new Set(rec.attendees || []);
  const members = (data.members || []).slice().sort((a,b)=>a.localeCompare(b));
  for (const name of members) {
    const li = document.createElement('li');
    li.className = 'member';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = attendees.has(name);
    cb.addEventListener('change', ()=>toggleAttendance(date, name, cb.checked));
    const span = document.createElement('span');
    span.textContent = name;
    const del = document.createElement('button');
    del.textContent = 'Remove';
    del.className = 'danger';
    del.addEventListener('click', ()=>removeMember(name));
    li.appendChild(cb);
    li.appendChild(span);
    li.appendChild(del);
    roster.appendChild(li);
  }

  // show guests for the date
  if ((rec.guests||[]).length) {
    const hdr = document.createElement('li');
    hdr.textContent = 'Guests';
    hdr.className = 'section-header';
    roster.appendChild(hdr);
    for (const g of rec.guests) {
      const li = document.createElement('li');
      li.className = 'member guest';
      const span = document.createElement('span');
      span.textContent = `${g.name} ${g.email ? ' <' + g.email + '>' : ''} ${g.phone ? '('+g.phone+')' : ''}`;
      const del = document.createElement('button');
      del.textContent = 'Remove';
      del.className = 'danger';
      del.addEventListener('click', ()=>removeGuest(g.name));
      li.appendChild(span);
      li.appendChild(del);
      roster.appendChild(li);
    }
  }
}

async function toggleAttendance(date, name, present) {
  await api('/api/attendance', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({date, name, present}) });
  data = await api('/api/data');
  renderRoster();
}

async function addMember() {
  const input = document.getElementById('newName');
  const name = input.value.trim();
  if (!name) return;
  await api('/api/members', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name}) });
  input.value = '';
  data = await api('/api/data');
  renderRoster();
}

async function importCsv() {
  const f = document.getElementById('csvFile').files[0];
  if (!f) return alert('Select a CSV file');
  const text = await f.text();
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  // assume each line is full name or has comma-separated values where name is first column
  const names = lines.map(l => {
    const parts = l.split(',');
    return parts[0].trim();
  }).filter(Boolean);
  await api('/api/import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({names}) });
  data = await api('/api/data');
  renderRoster();
}

async function removeMember(name) {
  if (!confirm(`Remove ${name}?`)) return;
  await api('/api/members', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name}) });
  data = await api('/api/data');
  renderRoster();
}

async function addGuest() {
  const name = document.getElementById('guestName').value.trim();
  const email = document.getElementById('guestEmail').value.trim();
  const phone = document.getElementById('guestPhone').value.trim();
  const date = document.getElementById('date').value;
  if (!name) return alert('Guest name required');
  await api('/api/attendance', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ date, guest: { name, email, phone } }) });
  document.getElementById('guestName').value = '';
  document.getElementById('guestEmail').value = '';
  document.getElementById('guestPhone').value = '';
  data = await api('/api/data');
  renderRoster();
}

async function removeGuest(name) {
  const date = document.getElementById('date').value;
  if (!confirm(`Remove guest ${name}?`)) return;
  await api('/api/attendance/guest', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ date, name }) });
  data = await api('/api/data');
  renderRoster();
}

async function exportCSV() {
  const date = document.getElementById('date').value;
  if (!date) return alert('Pick a date');
  const res = await fetch(`/api/export?date=${encodeURIComponent(date)}`);
  if (!res.ok) return alert('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('addBtn').addEventListener('click', addMember);
  document.getElementById('importBtn').addEventListener('click', importCsv);
  document.getElementById('date').addEventListener('change', ()=>{
    renderRoster();
  });
  document.getElementById('export').addEventListener('click', exportCSV);
  document.getElementById('addGuestBtn').addEventListener('click', addGuest);
  load().catch(err=>{ console.error(err); alert(err.message); });
});
