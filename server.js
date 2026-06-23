const express = require('./backend/node_modules/express');
const sqlite3 = require('./backend/node_modules/sqlite3').verbose();
const cors = require('./backend/node_modules/cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 25563;

app.use(cors());
app.use(express.json());

// Middleware to capture client IP
app.use((req, res, next) => {
    req.clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    next();
});

// Set up SQLite Database
const dbPath = path.join(__dirname, 'backend', 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                ip_address TEXT NOT NULL,
                score INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
});

// Serve frontend build if needed
// app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.get('/api/ranking', (req, res) => {
    const query = `
        SELECT username, MAX(score) AS max_score, MIN(created_at) AS achieved_at
        FROM scores
        GROUP BY username, ip_address
        ORDER BY max_score DESC, achieved_at ASC
        LIMIT 10
    `;
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching ranking', err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        res.json({
            status: 'success',
            ranking: rows.map((row, index) => ({
                rank: index + 1,
                username: row.username,
                score: row.max_score,
                achieved_at: row.achieved_at
            }))
        });
    });
});

app.post('/api/score', (req, res) => {
    const { username, score } = req.body;
    const clientIP = req.clientIP;
    
    // Validation
    if (!username || typeof username !== 'string' || username.trim().length === 0 || username.trim().length > 15) {
        return res.status(400).json({ status: 'error', message: 'Invalid username. Must be 1-15 characters long.' });
    }
    if (/<|>/g.test(username)) {
        return res.status(400).json({ status: 'error', message: 'Invalid username. HTML tags are not allowed.' });
    }
    if (typeof score !== 'number' || score < 0) {
        return res.status(400).json({ status: 'error', message: 'Invalid score.' });
    }

    const safeUsername = username.trim();

    // Unify user records by updating IP address for existing usernames
    db.run(`UPDATE scores SET ip_address = ? WHERE ip_address = '0.0.0.0' AND username = ?`, [clientIP, safeUsername], function(err) {
        if (err) {
            console.error('Error updating IP address', err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    });
  
    db.run(`INSERT INTO scores (username, ip_address, score) VALUES (?, ?, ?)`, [safeUsername, clientIP, score], function(err) {
        if (err) {
            console.error('Error saving score', err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        
        // Find rank of the user (considering IP for authentication)
        const query = `
            SELECT username, ip_address, MAX(score) AS max_score, MIN(created_at) AS achieved_at
            FROM scores
            GROUP BY username, ip_address
            ORDER BY max_score DESC, achieved_at ASC
        `;
        db.all(query, [], (err, rows) => {
            if (err) {
                return res.json({ status: 'success', message: 'Score saved successfully, but failed to fetch rank.', your_rank: -1 });
            }
            const rankIndex = rows.findIndex(row => row.username === safeUsername && row.ip_address === clientIP);
            res.json({
                status: 'success',
                message: 'Score saved successfully.',
                your_rank: rankIndex !== -1 ? rankIndex + 1 : -1
            });
        });
    });
});

app.post('/api/reset', (req, res) => {
    db.run(`DELETE FROM scores`, (err) => {
        if (err) {
            console.error('Error resetting database', err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        res.json({ status: 'success', message: 'Database reset successfully.' });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
