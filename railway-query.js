#!/usr/bin/env node

/**
 * Script per eseguire query SQL sul database Railway
 * Uso: node railway-query.js "SELECT * FROM pr LIMIT 5;"
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Percorso del database
const dbPath = path.join(__dirname, 'iconic.db');

// Query da riga di comando
const query = process.argv[2];

if (!query) {
  console.log('❌ Fornisci una query SQL come parametro');
  console.log('Esempi:');
  console.log('  node railway-query.js "SELECT * FROM pr;"');
  console.log('  node railway-query.js "SELECT COUNT(*) as totale FROM pr;"');
  console.log('  node railway-query.js ".tables"');
  process.exit(1);
}

console.log(`🔍 Eseguendo query: ${query}`);
console.log(`📂 Database: ${dbPath}`);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ Errore apertura database:', err.message);
    process.exit(1);
  }
  
  console.log('✅ Connesso al database SQLite');
});

// Gestione comandi speciali SQLite
if (query.startsWith('.')) {
  if (query === '.tables') {
    db.all("SELECT name FROM sqlite_master WHERE type='table';", [], (err, rows) => {
      if (err) {
        console.error('❌ Errore:', err.message);
      } else {
        console.log('📋 Tabelle disponibili:');
        rows.forEach(row => console.log(`  - ${row.name}`));
      }
      db.close();
    });
  } else if (query === '.schema') {
    db.all("SELECT sql FROM sqlite_master WHERE type='table';", [], (err, rows) => {
      if (err) {
        console.error('❌ Errore:', err.message);
      } else {
        console.log('🏗️ Schema del database:');
        rows.forEach(row => console.log(row.sql + ';'));
      }
      db.close();
    });
  } else {
    console.log('❌ Comando non supportato. Usa .tables o .schema');
    db.close();
  }
} else {
  // Query SQL normale
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('❌ Errore SQL:', err.message);
    } else {
      if (rows.length === 0) {
        console.log('📝 Nessun risultato trovato');
      } else {
        console.log(`📊 Risultati (${rows.length} righe):`);
        console.table(rows);
      }
    }
    
    db.close((err) => {
      if (err) {
        console.error('❌ Errore chiusura database:', err.message);
      }
      console.log('🔒 Database chiuso');
    });
  });
}
