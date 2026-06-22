const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const root = __dirname;
const port = Number(process.env.PORT) || 8080;
const dataDir = process.env.DATA_DIR || path.join(root, 'api');
const leadsPath = path.join(dataDir, 'leads.json');
const statePath = path.join(dataDir, 'webgap-state.json');

const defaultState = {
  deleted: [],
  inprogress: [],
  finished: [],
  sites: {},
  notes: {}
};

fs.mkdirSync(dataDir, { recursive: true });

app.use(express.json({ limit: '1mb' }));

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
}

function getLeads() {
  const parsed = readJsonFile(leadsPath, []);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && parsed.id) return [parsed];
  return [];
}

function saveLeads(leads) {
  writeJsonFile(leadsPath, leads);
}

function getState() {
  const parsed = readJsonFile(statePath, defaultState);
  return {
    deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
    inprogress: Array.isArray(parsed.inprogress) ? parsed.inprogress : [],
    finished: Array.isArray(parsed.finished) ? parsed.finished : [],
    sites: parsed.sites && typeof parsed.sites === 'object' ? parsed.sites : {},
    notes: parsed.notes && typeof parsed.notes === 'object' ? parsed.notes : {}
  };
}

function saveState(state) {
  writeJsonFile(statePath, {
    deleted: state.deleted || [],
    inprogress: state.inprogress || [],
    finished: state.finished || [],
    sites: state.sites || {},
    notes: state.notes || {}
  });
}

app.get('/api/leads', (_req, res) => {
  res.json(getLeads());
});

app.post('/api/leads', (req, res) => {
  try {
    const body = req.body || {};
    const lead = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
      name: String(body.name || ''),
      business: String(body.business || ''),
      phone: String(body.phone || ''),
      email: String(body.email || ''),
      type: String(body.type || ''),
      message: String(body.message || ''),
      read: false
    };
    saveLeads([lead, ...getLeads()]);
    res.json({ ok: true, id: lead.id });
  } catch {
    res.status(400).json({ ok: false });
  }
});

app.delete('/api/leads', (req, res) => {
  const id = req.query.id;
  if (!id) {
    res.status(400).json({ ok: false, error: 'missing id' });
    return;
  }
  saveLeads(getLeads().filter(lead => lead.id !== id));
  res.json({ ok: true });
});

app.get('/api/state', (_req, res) => {
  res.json(getState());
});

app.post('/api/state', (req, res) => {
  try {
    const body = req.body || {};
    saveState({
      deleted: Array.isArray(body.deleted) ? body.deleted : [],
      inprogress: Array.isArray(body.inprogress) ? body.inprogress : [],
      finished: Array.isArray(body.finished) ? body.finished : [],
      sites: body.sites && typeof body.sites === 'object' ? body.sites : {},
      notes: body.notes && typeof body.notes === 'object' ? body.notes : {}
    });
    res.json({ ok: true });
  } catch {
    res.status(400).json({ ok: false });
  }
});

app.use((req, res, next) => {
  let urlPath = decodeURIComponent(req.path);
  if (urlPath !== '/' && !urlPath.endsWith('/') && !path.extname(urlPath)) {
    const candidate = path.join(root, urlPath.slice(1));
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      res.redirect(301, `${urlPath}/`);
      return;
    }
  }
  next();
});

app.use(express.static(root, { index: 'index.html', dotfiles: 'deny' }));

app.use((_req, res) => {
  res.status(404).send('404 - Not Found');
});

app.listen(port, () => {
  console.log(`Webnara running on port ${port}`);
  console.log(`Data directory: ${dataDir}`);
});
