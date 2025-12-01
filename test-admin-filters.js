/**
 * Test per verificare il funzionamento del sistema di filtri admin
 * Esegui con: node test-admin-filters.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getPRHierarchy, createAdminFilter, canAdminAccessPR, getFilteredStaffQuery } = require('./utils/admin-data-filter');

// Connessione al database
const dbPath = path.join(__dirname, 'iconic.db');
const db = new sqlite3.Database(dbPath);

console.log('=== TEST SISTEMA FILTRI ADMIN ===\n');

// Funzione per testare la gerarchia di un admin
async function testAdminHierarchy(adminId) {
  try {
    console.log(`--- TEST ADMIN ID: ${adminId} ---`);
    
    // 1. Test getPRHierarchy
    console.log('1. Testing getPRHierarchy...');
    const hierarchy = await getPRHierarchy(adminId);
    console.log('Gerarchia trovata:', hierarchy);
    
    // 2. Test createAdminFilter
    console.log('\n2. Testing createAdminFilter...');
    const filter = await createAdminFilter(adminId);
    console.log('Filtro generato:', filter);
    
    // 3. Test getFilteredStaffQuery
    console.log('\n3. Testing getFilteredStaffQuery...');
    const query = await getFilteredStaffQuery(adminId);
    console.log('Query generata (primi 200 caratteri):', query.substring(0, 200) + '...');
    
    // 4. Esegui la query e mostra i risultati
    console.log('\n4. Eseguendo la query sul database...');
    db.all(query, [], (err, results) => {
      if (err) {
        console.error('Errore esecuzione query:', err);
        return;
      }
      
      console.log(`Risultati trovati: ${results.length} utenti`);
      results.forEach(user => {
        console.log(`  - ${user.nickname} (${user.ruolo}) - Padre: ${user.padre_nickname || 'Nessuno'}`);
      });
      
      console.log(`\n--- FINE TEST ADMIN ${adminId} ---\n`);
    });
    
  } catch (error) {
    console.error(`Errore durante il test dell'admin ${adminId}:`, error);
  }
}

// Funzione per testare i permessi di accesso
async function testAccessPermissions() {
  try {
    console.log('\n--- TEST PERMESSI ACCESSO ---');
    
    // Test vari scenari di accesso
    const testCases = [
      { adminId: 1, targetId: 1, targetType: 'admin', expected: true },
      { adminId: 1, targetId: 2, targetType: 'admin', expected: false },
      { adminId: 1, targetId: 1, targetType: 'pre_admin', expected: true }, // Assumendo che esista
    ];
    
    for (const test of testCases) {
      const canAccess = await canAdminAccessPR(test.adminId, test.targetId, test.targetType);
      const result = canAccess === test.expected ? '✓' : '✗';
      console.log(`${result} Admin ${test.adminId} -> ${test.targetType} ${test.targetId}: ${canAccess} (expected: ${test.expected})`);
    }
    
  } catch (error) {
    console.error('Errore durante test permessi:', error);
  }
}

// Funzione principale per i test
async function runTests() {
  try {
    // Primo, otteniamo la lista degli admin esistenti
    db.all('SELECT id, nickname FROM admin LIMIT 3', [], async (err, admins) => {
      if (err) {
        console.error('Errore nel recuperare admin:', err);
        return;
      }
      
      console.log('Admin trovati nel database:', admins.map(a => `${a.id}: ${a.nickname}`).join(', '));
      console.log('');
      
      // Testa ogni admin
      for (const admin of admins) {
        await testAdminHierarchy(admin.id);
        // Piccola pausa per evitare sovrapposizioni nell'output
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Test permessi
      await testAccessPermissions();
      
      console.log('\n=== FINE TUTTI I TEST ===');
      db.close();
    });
    
  } catch (error) {
    console.error('Errore generale durante i test:', error);
    db.close();
  }
}

// Avvia i test
runTests();
