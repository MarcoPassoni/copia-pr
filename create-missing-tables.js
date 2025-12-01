/**
 * Script per creare le tabelle mancanti nel database ICONIC
 * Da eseguire quando si deploya su Railway o altri servizi cloud
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connessione al database - usa volume Railway se disponibile
const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH ? 
  path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'iconic.db') : 
  path.join(__dirname, 'iconic.db');

console.log('📁 Database path:', dbPath);
const db = new sqlite3.Database(dbPath);

/**
 * Crea tutte le tabelle mancanti con la struttura completa aggiornata
 */
function createAllMissingTables() {
  return new Promise((resolve, reject) => {
    const createTablesQueries = [
      // Tabella admin
      `CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cognome TEXT NOT NULL,
        numero_telefono TEXT NOT NULL,
        nickname TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      )`,
      
      // Tabella pre_admin
      `CREATE TABLE IF NOT EXISTS pre_admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fk_admin INTEGER,
        nome TEXT NOT NULL,
        cognome TEXT NOT NULL,
        numero_telefono TEXT NOT NULL,
        nickname TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        FOREIGN KEY(fk_admin) REFERENCES admin(id)
      )`,
      
      // Tabella pr
      `CREATE TABLE IF NOT EXISTS pr (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fk_padre INTEGER,
        nome TEXT NOT NULL,
        cognome TEXT NOT NULL,
        numero_telefono TEXT NOT NULL,
        nickname TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        percentuale_provvigione REAL,
        poteri BOOLEAN DEFAULT 0,
        provvigioni_da_pagare REAL DEFAULT 0,
        tot_spesa_tavolo REAL DEFAULT 0,
        tot_persone_portate INTEGER DEFAULT 0,
        provvigioni_totali_maturate REAL DEFAULT 0,
        provvigioni_totali_pagate REAL DEFAULT 0,
        FOREIGN KEY(fk_padre) REFERENCES admin(id)
      )`,
      
      // Tabella storico_tavoli con campi aggiornati
      `CREATE TABLE IF NOT EXISTS storico_tavoli (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_id INTEGER NOT NULL,
        data TEXT NOT NULL,
        numero_persone INTEGER NOT NULL,
        nome_tavolo TEXT NOT NULL,
        spesa_prevista REAL NOT NULL,
        omaggi TEXT,
        note_tavolo TEXT,
        modificata INTEGER DEFAULT 0,
        note_modifiche TEXT,
        modificato_da_nickname TEXT,
        FOREIGN KEY(pr_id) REFERENCES pr(id)
      )`,
      
      // Tabella andamento_staff_mensile
      `CREATE TABLE IF NOT EXISTS andamento_staff_mensile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_id INTEGER NOT NULL,
        mese TEXT NOT NULL,
        totale_mese REAL NOT NULL DEFAULT 0,
        UNIQUE(pr_id, mese),
        FOREIGN KEY(pr_id) REFERENCES pr(id)
      )`,
      
      // Tabella richieste_tavoli con campi aggiornati
      `CREATE TABLE IF NOT EXISTS richieste_tavoli (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_id INTEGER NOT NULL,
        data TEXT NOT NULL,
        numero_persone INTEGER NOT NULL,
        spesa_prevista REAL NOT NULL,
        omaggi TEXT,
        nome_tavolo TEXT NOT NULL,
        note_tavolo TEXT,
        stato TEXT NOT NULL DEFAULT 'in attesa',
        modificata INTEGER DEFAULT 0,
        note_modifiche TEXT,
        modificato_da_nickname TEXT,
        FOREIGN KEY(pr_id) REFERENCES pr(id)
      )`,
      
      // Tabella pr_stats
      `CREATE TABLE IF NOT EXISTS pr_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_id INTEGER NOT NULL,
        anno INTEGER NOT NULL,
        mese INTEGER NOT NULL,
        totale_persone INTEGER DEFAULT 0,
        totale_tavoli INTEGER DEFAULT 0,
        totale_provvigioni REAL DEFAULT 0,
        UNIQUE(pr_id, anno, mese),
        FOREIGN KEY(pr_id) REFERENCES pr(id)
      )`,
      
      // Tabella pagamenti_provvigioni
      `CREATE TABLE IF NOT EXISTS pagamenti_provvigioni (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_destinatario_id INTEGER NOT NULL,
        pr_pagante_id INTEGER NOT NULL,
        importo REAL NOT NULL,
        note TEXT,
        data_pagamento DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(pr_destinatario_id) REFERENCES pr(id),
        FOREIGN KEY(pr_pagante_id) REFERENCES pr(id)
      )`,
      
      // Tabella richieste_creazione_pr
      `CREATE TABLE IF NOT EXISTS richieste_creazione_pr (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cognome TEXT NOT NULL,
        numero_telefono TEXT NOT NULL,
        nickname TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        percentuale_provvigione REAL,
        data_richiesta DATETIME DEFAULT CURRENT_TIMESTAMP,
        stato TEXT NOT NULL DEFAULT 'in attesa',
        note TEXT,
        fk_richiedente INTEGER,
        FOREIGN KEY(fk_richiedente) REFERENCES pr(id)
      )`
    ];
    
    let completed = 0;
    const total = createTablesQueries.length;
    console.log(`🏗️  Creazione ${total} tabelle...`);
    
    createTablesQueries.forEach((query, index) => {
      const tableName = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1];
      
      db.run(query, function(err) {
        if (err) {
          console.error(`❌ Errore nella creazione della tabella ${tableName}:`, err.message);
          reject(err);
        } else {
          console.log(`✅ Tabella ${tableName} creata/verificata con successo`);
          completed++;
          
          if (completed === total) {
            console.log(`🎉 Tutte le ${total} tabelle sono state create/verificate!`);
            resolve();
          }
        }
      });
    });
  });
}

/**
 * Aggiunge colonne mancanti alle tabelle esistenti
 */
function addMissingColumns() {
  return new Promise((resolve, reject) => {
    const alterQueries = [
      // Aggiungi colonne mancanti a storico_tavoli
      `ALTER TABLE storico_tavoli ADD COLUMN modificata INTEGER DEFAULT 0`,
      `ALTER TABLE storico_tavoli ADD COLUMN note_modifiche TEXT`,
      `ALTER TABLE storico_tavoli ADD COLUMN modificato_da_nickname TEXT`,
      
      // Aggiungi colonne mancanti a richieste_tavoli
      `ALTER TABLE richieste_tavoli ADD COLUMN modificata INTEGER DEFAULT 0`,
      `ALTER TABLE richieste_tavoli ADD COLUMN note_modifiche TEXT`,
      `ALTER TABLE richieste_tavoli ADD COLUMN modificato_da_nickname TEXT`,
      
      // Aggiungi colonne mancanti alla tabella pr
      `ALTER TABLE pr ADD COLUMN provvigioni_totali_maturate REAL DEFAULT 0`,
      `ALTER TABLE pr ADD COLUMN provvigioni_totali_pagate REAL DEFAULT 0`
    ];
    
    let completed = 0;
    let errors = 0;
    
    console.log('\n🔧 Aggiunta colonne mancanti...');
    
    alterQueries.forEach((query) => {
      const match = query.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);
      const tableName = match ? match[1] : 'unknown';
      const columnName = match ? match[2] : 'unknown';
      
      db.run(query, function(err) {
        completed++;
        
        if (err) {
          if (err.message.includes('duplicate column name')) {
            console.log(`ℹ️  Colonna ${columnName} già esistente in ${tableName}`);
          } else {
            console.error(`❌ Errore aggiunta colonna ${columnName} a ${tableName}:`, err.message);
            errors++;
          }
        } else {
          console.log(`✅ Colonna ${columnName} aggiunta a ${tableName}`);
        }
        
        if (completed === alterQueries.length) {
          if (errors === 0) {
            console.log('🎉 Tutte le colonne sono state aggiunte/verificate!');
            resolve();
          } else {
            reject(new Error(`Errori durante l'aggiunta delle colonne: ${errors}`));
          }
        }
      });
    });
  });
}

/**
 * Verifica lo stato delle tabelle e colonne
 */
function verifyTables() {
  return new Promise((resolve, reject) => {
    const tables = [
      'admin', 'pre_admin', 'pr', 'storico_tavoli', 'andamento_staff_mensile',
      'richieste_tavoli', 'pr_stats', 'pagamenti_provvigioni', 'richieste_creazione_pr'
    ];
    let completed = 0;
    
    console.log('\n🔍 Verifica tabelle...');
    
    tables.forEach(table => {
      db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table], (err, row) => {
        if (err) {
          reject(err);
        } else {
          if (row) {
            console.log(`   ✅ ${table}: trovata`);
          } else {
            console.log(`   ❌ ${table}: non trovata`);
          }
          completed++;
          if (completed === tables.length) {
            // Verifica anche alcune colonne critiche
            verifyColumns().then(resolve).catch(reject);
          }
        }
      });
    });
  });
}

/**
 * Verifica colonne critiche
 */
function verifyColumns() {
  return new Promise((resolve, reject) => {
    console.log('\n🔍 Verifica colonne critiche...');
    
    const columnChecks = [
      { table: 'storico_tavoli', column: 'modificata' },
      { table: 'storico_tavoli', column: 'note_modifiche' },
      { table: 'storico_tavoli', column: 'modificato_da_nickname' },
      { table: 'richieste_tavoli', column: 'modificata' },
      { table: 'richieste_tavoli', column: 'note_modifiche' },
      { table: 'richieste_tavoli', column: 'modificato_da_nickname' }
    ];
    
    let completed = 0;
    
    columnChecks.forEach(check => {
      db.get(`PRAGMA table_info(${check.table})`, (err, rows) => {
        if (err) {
          console.error(`   ❌ Errore verifica ${check.table}.${check.column}:`, err.message);
        } else {
          // Verifica se la colonna esiste nella struttura
          db.all(`PRAGMA table_info(${check.table})`, (err2, columns) => {
            if (!err2) {
              const hasColumn = columns.some(col => col.name === check.column);
              if (hasColumn) {
                console.log(`   ✅ ${check.table}.${check.column}: trovata`);
              } else {
                console.log(`   ⚠️  ${check.table}.${check.column}: mancante`);
              }
            }
          });
        }
        
        completed++;
        if (completed === columnChecks.length) {
          resolve();
        }
      });
    });
  });
}

/**
 * Funzione principale per inizializzare tutte le tabelle
 */
async function initMissingTables() {
  console.log('🔧 Inizializzazione completa database ICONIC per Railway...\n');
  
  try {
    // Crea tutte le tabelle con la struttura completa
    await createAllMissingTables();
    
    // Aggiunge colonne mancanti alle tabelle esistenti
    await addMissingColumns();
    
    // Verifica lo stato finale
    await verifyTables();
    
    console.log('\n✨ Database completamente inizializzato!');
    console.log('🚀 Tutte le tabelle e colonne sono ora disponibili su Railway');
    
  } catch (error) {
    console.error('\n💥 Errore durante l\'inizializzazione completa:', error);
    process.exit(1);
  } finally {
    // Chiude la connessione al database
    db.close((err) => {
      if (err) {
        console.error('Errore nella chiusura del database:', err.message);
      } else {
        console.log('🔒 Connessione database chiusa');
      }
    });
  }
}

// Esecuzione dello script
if (require.main === module) {
  console.log('🏗️  Creazione tabelle mancanti per deployment...\n');
  
  initMissingTables()
    .then(() => {
      console.log('\n🎉 Operazione completata con successo!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Errore fatale:', error);
      process.exit(1);
    });
}

module.exports = {
  initMissingTables,
  createAllMissingTables,
  addMissingColumns,
  verifyTables,
  verifyColumns
};
