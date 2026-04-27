const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_SHEETS_API = 'https://script.google.com/macros/s/AKfycbxbCU1eiCPPMnNx_H7nkMhFpY_Rh_ozP0_xyxn18zCbJ-Lrgbx0iJXhHOrRK6bFvcHIMQ/exec';

// Solutions data file
const DATA_DIR = path.join(__dirname, 'data');
const SOLUTIONS_FILE = path.join(DATA_DIR, 'solutions.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SOLUTIONS_FILE)) {
  fs.writeFileSync(SOLUTIONS_FILE, '[]', 'utf8');
}

// Helper: read solutions from JSON file
function readSolutions() {
  try {
    const raw = fs.readFileSync(SOLUTIONS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

// Helper: write solutions to JSON file
function writeSolutions(data) {
  fs.writeFileSync(SOLUTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/solutions', (req, res) => res.sendFile('/var/www/api/public/solutions.html'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/liveRepairs', async (req, res) => {
  try {
    const response = await fetch(GOOGLE_SHEETS_API + '?action=liveRepairs', { redirect: 'follow' });
    const data = await response.json();
    return res.json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error fetching live repairs:', error.message);
    return res.json([]);
  }
});

// GET /api/solutions - Return all solutions
app.get('/api/solutions', async (req, res) => {
  try {
    // If ?q=search param provided, do search
    if (req.query.q) {
      const keyword = req.query.q.toLowerCase().trim();
      const allSolutions = readSolutions();
      const filtered = allSolutions.filter(s => 
        s.title.toLowerCase().includes(keyword) ||
        s.description.toLowerCase().includes(keyword) ||
        s.category.toLowerCase().includes(keyword)
      );
      return res.json(filtered);
    }
    return res.json(readSolutions());
  } catch (error) {
    console.error('Error reading solutions:', error.message);
    return res.json([]);
  }
});

// POST /api/solutions - Add a new solution (from Telegram bot)
app.post('/api/solutions', (req, res) => {
  try {
    const { title, description, category, author, image } = req.body;
    if (!title || !description || !category || !author) {
      return res.status(400).json({ error: true, message: 'Missing required fields: title, description, category, author' });
    }
    const solutions = readSolutions();
    const newSolution = {
      id: Date.now(),
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      author: author.trim(),
      image: image || null,
      date: new Date().toISOString().split('T')[0],
      likes: 0
    };
    solutions.unshift(newSolution);
    writeSolutions(solutions);
    console.log('New solution added:', newSolution.id, newSolution.title);
    return res.json({ success: true, data: newSolution });
  } catch (error) {
    console.error('Error adding solution:', error.message);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
});

// PUT /api/solutions/:id/like - Increment likes
app.put('/api/solutions/:id/like', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const solutions = readSolutions();
    const index = solutions.findIndex(s => s.id === id);
    if (index === -1) {
      return res.status(404).json({ error: true, message: 'Solution not found' });
    }
    solutions[index].likes = (solutions[index].likes || 0) + 1;
    writeSolutions(solutions);
    return res.json({ success: true, likes: solutions[index].likes });
  } catch (error) {
    console.error('Error liking solution:', error.message);
    return res.status(500).json({ error: true, message: 'Internal server error' });
  }
});

app.get('/api/voucher/:voucher', async (req, res) => {
  try {
    const voucher = req.params.voucher.toUpperCase().trim();
    const response = await fetch(GOOGLE_SHEETS_API + '?action=voucher&id=' + encodeURIComponent(voucher), { redirect: 'follow' });
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Error in voucher lookup:', error.message);
    res.status(500).json({ error: true, message: 'Internal server error' });
  }
});

app.get('/api/currency', async (req, res) => {
  try {
    const response = await fetch(GOOGLE_SHEETS_API + '?action=currency', { redirect: 'follow' });
    const data = await response.json();
    if (Array.isArray(data)) return res.json(data);
    throw new Error('Invalid response');
  } catch (error) {
    console.error('Error fetching currency:', error.message);
    return res.json([
      { code: 'USD', rate: 3520, change: '+0.5%' },
      { code: 'THB', rate: 98.5, change: '-0.2%' },
      { code: 'SGD', rate: 2610, change: '+0.1%' }
    ]);
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});


// GitHub webhook auto-deploy
app.post('/webhook', (req, res) => {
  const event = req.headers['x-github-event'] || '';
  console.log('Webhook event:', event);
  if (event === 'push') {
    require('child_process').exec('/usr/local/bin/deploy-web.sh', { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Deploy error:', stderr || err.message);
        return res.status(500).json({ ok: false, error: stderr || err.message });
      }
      console.log('Auto-deploy OK');
      res.json({ ok: true });
    });
  } else {
    res.json({ ok: true, msg: 'ignored: ' + event });
  }
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
  console.log('Using Google Sheets API: ' + GOOGLE_SHEETS_API);
  console.log('Solutions data file: ' + SOLUTIONS_FILE);
});

module.exports = app;