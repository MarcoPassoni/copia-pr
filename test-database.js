/**
 * Test completo del database per verificare tutte le tabelle e colonne
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connessione al database - usa stesso path di db.js
const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH ? 
  path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'iconic.db') : 
  path.join(__dirname, 'iconic.db');

console.log('📁 Testing database at:', dbPath);
const db = new sqlite3.Database(dbPath);

/**
 * Testa tutte le query utilizzate nell'app per verificare che funzionino
 */
async function testDatabaseQueries() {
  console.log('🧪 Test completo delle query del database...\n');
  
  const testQueries = [
    {
      name: 'Test query organigramma (pagamenti_provvigioni)',
      query: `SELECT COALESCE(SUM(importo), 0) as pagamenti_ricevuti 
              FROM pagamenti_provvigioni 
              WHERE pr_destinatario_id = 1`
    },
    {
      name: 'Test query richieste con campi modifica',
      query: `SELECT id, pr_id, data, numero_persone, nome_tavolo, spesa_prevista, 
              omaggi, note_tavolo, stato, modificata, note_modifiche, modificato_da_nickname
              FROM richieste_tavoli LIMIT 1`
    },
    {
      name: 'Test query storico con campi modifica',
      query: `SELECT id, pr_id, data, numero_persone, nome_tavolo, spesa_prevista, 
              omaggi, note_tavolo, modificata, note_modifiche, modificato_da_nickname
              FROM storico_tavoli LIMIT 1`
    },
    {
      name: 'Test query admin provvigioni',
      query: `SELECT p.id, p.nome, p.cognome, p.nickname, p.percentuale_provvigione,
              COALESCE((SELECT SUM(importo) FROM pagamenti_provvigioni WHERE pr_destinatario_id = p.id), 0) as provvigioni_pagate
              FROM pr p LIMIT 1`
    },
    {
      name: 'Test query richieste_creazione_pr',
      query: `SELECT id, nome, cognome, nickname, stato, data_richiesta 
              FROM richieste_creazione_pr LIMIT 1`
    }
  ];
  
  let totalTests = testQueries.length;
  let passedTests = 0;
  let failedTests = 0;
  
  for (const test of testQueries) {
    try {
      await new Promise((resolve, reject) => {
        db.all(test.query, [], (err, rows) => {
          if (err) {
            console.log(`❌ ${test.name}`);
            console.log(`   Errore: ${err.message}\n`);
            failedTests++;
            reject(err);
          } else {
            console.log(`✅ ${test.name}`);
            console.log(`   Risultati: ${rows.length} righe\n`);
            passedTests++;
            resolve();
          }
        });
      });
    } catch (error) {
      // Errore già gestito nel callback
    }
  }
  
  console.log('📊 Risultati Test:');
  console.log(`   ✅ Test passati: ${passedTests}/${totalTests}`);
  console.log(`   ❌ Test falliti: ${failedTests}/${totalTests}`);
  
  if (failedTests === 0) {
    console.log('\n🎉 Tutti i test sono passati! Il database è pronto per Railway!');
  } else {
    console.log('\n⚠️  Alcuni test sono falliti. Controlla le tabelle mancanti.');
  }
  
  return failedTests === 0;
}

/**
 * Verifica la struttura completa del database
 */
async function verifyDatabaseStructure() {
  console.log('🔍 Verifica struttura completa del database...\n');
  
  const expectedTables = [
    'admin', 'pre_admin', 'pr', 'storico_tavoli', 'andamento_staff_mensile',
    'richieste_tavoli', 'pr_stats', 'pagamenti_provvigioni', 'richieste_creazione_pr'
  ];
  
  const expectedColumns = {
    'storico_tavoli': ['id', 'pr_id', 'data', 'numero_persone', 'nome_tavolo', 'spesa_prevista', 
                       'omaggi', 'note_tavolo', 'modificata', 'note_modifiche', 'modificato_da_nickname'],
    'richieste_tavoli': ['id', 'pr_id', 'data', 'numero_persone', 'spesa_prevista', 'omaggi', 
                         'nome_tavolo', 'note_tavolo', 'stato', 'modificata', 'note_modifiche', 'modificato_da_nickname'],
    'pagamenti_provvigioni': ['id', 'pr_destinatario_id', 'pr_pagante_id', 'importo', 'note', 'data_pagamento']
  };
  
  let allGood = true;
  
  // Verifica tabelle
  for (const table of expectedTables) {
    try {
      const exists = await new Promise((resolve) => {
        db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table], (err, row) => {
          resolve(!!row);
        });
      });
      
      if (exists) {
        console.log(`✅ Tabella ${table}: trovata`);
      } else {
        console.log(`❌ Tabella ${table}: MANCANTE`);
        allGood = false;
      }
    } catch (error) {
      console.log(`❌ Errore verifica tabella ${table}:`, error.message);
      allGood = false;
    }
  }
  
  // Verifica colonne critiche
  console.log('\n🔍 Verifica colonne critiche...');
  
  for (const [table, columns] of Object.entries(expectedColumns)) {
    try {
      const tableColumns = await new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.name));
        });
      });
      
      for (const expectedColumn of columns) {
        if (tableColumns.includes(expectedColumn)) {
          console.log(`✅ ${table}.${expectedColumn}: trovata`);
        } else {
          console.log(`❌ ${table}.${expectedColumn}: MANCANTE`);
          allGood = false;
        }
      }
    } catch (error) {
      console.log(`❌ Errore verifica colonne ${table}:`, error.message);
      allGood = false;
    }
  }
  
  return allGood;
}

/**
 * Funzione principale di test
 */
async function runFullDatabaseTest() {
  console.log('🚀 Test Completo Database ICONIC\n');
  console.log('Questo script verifica che tutte le tabelle e colonne siano presenti');
  console.log('e che tutte le query dell\'app funzionino correttamente.\n');
  
  try {
    // Test struttura
    const structureOK = await verifyDatabaseStructure();
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test query
    const queriesOK = await testDatabaseQueries();
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Risultato finale
    if (structureOK && queriesOK) {
      console.log('🎉 DATABASE PRONTO PER RAILWAY!');
      console.log('✅ Tutte le tabelle sono presenti');
      console.log('✅ Tutte le colonne sono presenti');
      console.log('✅ Tutte le query funzionano');
      console.log('\n🚀 Puoi procedere con il deploy su Railway!');
    } else {
      console.log('⚠️  DATABASE NON PRONTO');
      if (!structureOK) console.log('❌ Struttura incompleta');
      if (!queriesOK) console.log('❌ Query fallite');
      console.log('\n🔧 Esegui: npm run init-tables');
    }
    
  } catch (error) {
    console.error('💥 Errore durante il test:', error);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Errore chiusura database:', err.message);
      } else {
        console.log('\n🔒 Test completato');
      }
    });
  }
}

// Esecuzione
if (require.main === module) {
  runFullDatabaseTest();
}

module.exports = {
  runFullDatabaseTest,
  verifyDatabaseStructure,
  testDatabaseQueries
};
