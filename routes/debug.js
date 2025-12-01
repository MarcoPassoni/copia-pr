/**
 * Route di debug per query al database
 * URL: /debug/query?sql=SELECT * FROM pr LIMIT 5
 * ATTENZIONE: Solo per sviluppo, non usare in produzione!
 */

const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Middleware per limitare l'accesso solo agli admin in sviluppo
router.use((req, res, next) => {
  // Solo in sviluppo o per utenti admin
  if (process.env.NODE_ENV === 'production' && req.session?.user?.ruolo !== 'admin') {
    return res.status(403).json({ error: 'Accesso negato' });
  }
  next();
});

// Route per query personalizzate
router.get('/query', (req, res) => {
  const sql = req.query.sql;
  
  if (!sql) {
    return res.json({ 
      error: 'Parametro sql mancante',
      examples: [
        '/debug/query?sql=SELECT * FROM pr LIMIT 5',
        '/debug/query?sql=SELECT COUNT(*) as totale FROM pr',
        '/debug/query?sql=.tables'
      ]
    });
  }

  // [PRODUCTION] Removed console.log(`[DEBUG] Eseguendo query: ${sql}`)

  // Gestione comandi speciali
  if (sql === '.tables') {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ 
          command: '.tables',
          tables: rows.map(r => r.name),
          count: rows.length
        });
      }
    });
    return;
  }

  if (sql === '.schema') {
    db.all("SELECT name, sql FROM sqlite_master WHERE type='table'", [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ 
          command: '.schema',
          schemas: rows,
          count: rows.length
        });
      }
    });
    return;
  }

  // Query normale
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({
        query: sql,
        data: rows,
        count: rows.length,
        timestamp: new Date().toISOString()
      });
    }
  });
});

// Route per info database
router.get('/info', (req, res) => {
  const queries = [
    { name: 'admin_count', sql: 'SELECT COUNT(*) as count FROM admin' },
    { name: 'pr_count', sql: 'SELECT COUNT(*) as count FROM pr' },
    { name: 'tavoli_count', sql: 'SELECT COUNT(*) as count FROM storico_tavoli' },
    { name: 'richieste_count', sql: 'SELECT COUNT(*) as count FROM richieste_tavoli' }
  ];

  const results = {};
  let completed = 0;

  queries.forEach(query => {
    db.get(query.sql, [], (err, row) => {
      if (err) {
        results[query.name] = { error: err.message };
      } else {
        results[query.name] = row.count;
      }
      
      completed++;
      if (completed === queries.length) {
        res.json({
          database_info: results,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
});

module.exports = router;
