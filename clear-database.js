/**
 * Script per pulire tutti i dati dal database ICONIC
 * Mantiene la struttura delle tabelle ma rimuove tutti i record
 */



const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connessione al database - usa volume Railway se disponibile
const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH ? 
  path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'iconic.db') : 
  path.join(__dirname, 'iconic.db');

console.log('📁 Database path:', dbPath);
const db = new sqlite3.Database(dbPath);

// Lista delle tabelle da pulire completamente (senza admin)
const tablesToClearCompletely = [
    'pre_admin',
    'pr', 
    'storico_tavoli',
    'andamento_staff_mensile',
    'richieste_tavoli',
    'pr_stats',
    'pagamenti_provvigioni',
    'richieste_creazione_pr'
];

// Tabelle che contengono dati correlati agli admin (da pulire parzialmente)
const adminRelatedTables = [
    'storico_tavoli',     // Tavoli gestiti dagli admin
    'andamento_staff_mensile',  // Performance degli admin
    'pagamenti_provvigioni',    // Pagamenti agli admin
    'pr_stats'                  // Statistiche admin
];

/**
 * Funzione per pulire una singola tabella completamente
 */
function clearTable(tableName) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM ${tableName}`, function(err) {
            if (err) {
                console.error(`❌ Errore nella pulizia della tabella ${tableName}:`, err.message);
                reject(err);
            } else {
                console.log(`✅ Tabella ${tableName} pulita completamente - ${this.changes} record eliminati`);
                resolve(this.changes);
            }
        });
    });
}

/**
 * Funzione per pulire dati correlati agli admin (preservando gli admin stessi)
 */
function clearAdminRelatedData() {
    return new Promise((resolve, reject) => {
        // Prima ottiene gli ID degli admin da preservare
        db.all(`SELECT id FROM admin`, (err, adminRows) => {
            if (err) {
                console.error('❌ Errore nel recupero admin:', err.message);
                reject(err);
                return;
            }

            const adminIds = adminRows.map(row => row.id);
            console.log(`👑 Trovati ${adminIds.length} admin da preservare: ${adminIds.join(', ')}`);
            
            let totalDeleted = 0;
            let completedQueries = 0;
            const totalQueries = 4; // Numero di query di pulizia

            const handleQueryComplete = (deletedCount, tableName, description) => {
                totalDeleted += deletedCount;
                console.log(`🧹 ${description} - ${deletedCount} record eliminati`);
                completedQueries++;
                
                if (completedQueries === totalQueries) {
                    console.log(`✅ Dati correlati agli admin puliti - ${totalDeleted} record totali eliminati`);
                    resolve(totalDeleted);
                }
            };

            // 1. Pulisce storico_tavoli degli admin (se hanno pr_id che corrisponde a admin)
            db.run(`DELETE FROM storico_tavoli WHERE pr_id IN (${adminIds.join(',')})`, function(err) {
                if (err) {
                    console.error('❌ Errore pulizia storico_tavoli admin:', err.message);
                    reject(err);
                } else {
                    handleQueryComplete(this.changes, 'storico_tavoli', 'Storico tavoli degli admin');
                }
            });

            // 2. Pulisce andamento_staff_mensile degli admin
            db.run(`DELETE FROM andamento_staff_mensile WHERE user_id IN (${adminIds.join(',')}) AND user_type = 'admin'`, function(err) {
                if (err) {
                    console.error('❌ Errore pulizia andamento_staff_mensile admin:', err.message);
                    reject(err);
                } else {
                    handleQueryComplete(this.changes, 'andamento_staff_mensile', 'Andamento mensile degli admin');
                }
            });

            // 3. Pulisce pagamenti_provvigioni degli admin
            db.run(`DELETE FROM pagamenti_provvigioni WHERE pr_id IN (${adminIds.join(',')})`, function(err) {
                if (err) {
                    console.error('❌ Errore pulizia pagamenti_provvigioni admin:', err.message);
                    reject(err);
                } else {
                    handleQueryComplete(this.changes, 'pagamenti_provvigioni', 'Pagamenti provvigioni degli admin');
                }
            });

            // 4. Pulisce pr_stats degli admin
            db.run(`DELETE FROM pr_stats WHERE pr_id IN (${adminIds.join(',')})`, function(err) {
                if (err) {
                    console.error('❌ Errore pulizia pr_stats admin:', err.message);
                    reject(err);
                } else {
                    handleQueryComplete(this.changes, 'pr_stats', 'Statistiche degli admin');
                }
            });
        });
    });
}

/**
 * Funzione per resettare i contatori auto-increment (solo per tabelle non-admin)
 */
function resetAutoIncrementSelective() {
    return new Promise((resolve, reject) => {
        // Reset solo per le tabelle che sono state completamente pulite
        const tablesToReset = tablesToClearCompletely.filter(table => 
            !['storico_tavoli', 'andamento_staff_mensile', 'pagamenti_provvigioni', 'pr_stats'].includes(table)
        );
        
        if (tablesToReset.length === 0) {
            console.log('🔄 Nessun contatore auto-increment da resettare');
            resolve();
            return;
        }
        
        const resetQueries = tablesToReset.map(table => 
            `DELETE FROM sqlite_sequence WHERE name='${table}'`
        ).join('; ');
        
        db.exec(resetQueries, function(err) {
            if (err) {
                console.error('❌ Errore nel reset selettivo dei contatori auto-increment:', err.message);
                reject(err);
            } else {
                console.log(`🔄 Contatori auto-increment resettati per: ${tablesToReset.join(', ')}`);
                resolve();
            }
        });
    });
}

/**
 * Funzione per resettare TUTTI i contatori auto-increment (funzione originale)
 */
function resetAutoIncrement() {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM sqlite_sequence`, function(err) {
            if (err) {
                console.error('❌ Errore nel reset dei contatori auto-increment:', err.message);
                reject(err);
            } else {
                console.log('🔄 Tutti i contatori auto-increment resettati');
                resolve();
            }
        });
    });
}

/**
 * Funzione principale per pulire il database (preservando gli admin)
 */
async function clearDatabase() {
    console.log('🧹 Inizio pulizia database ICONIC (preservando admin)...\n');
    
    try {
        let totalRecordsDeleted = 0;
        
        // 1. Pulisce tutte le tabelle completamente (escluso admin)
        console.log('🗑️  Pulizia completa delle tabelle non-admin...');
        for (const table of tablesToClearCompletely) {
            const deletedCount = await clearTable(table);
            totalRecordsDeleted += deletedCount;
        }
        
        // 2. Pulisce i dati correlati agli admin (preservando gli admin stessi)
        console.log('\n👑 Pulizia dati correlati agli admin...');
        const adminRelatedDeleted = await clearAdminRelatedData();
        totalRecordsDeleted += adminRelatedDeleted;
        
        // 3. Reset dei contatori auto-increment (solo per tabelle non-admin)
        console.log('\n🔄 Reset contatori auto-increment...');
        await resetAutoIncrementSelective();
        
        console.log('\n📊 Riepilogo pulizia:');
        console.log(`   • Tabelle completamente pulite: ${tablesToClearCompletely.length}`);
        console.log(`   • Admin preservati: ✅`);
        console.log(`   • Dati admin correlati eliminati: ✅`);
        console.log(`   • Record totali eliminati: ${totalRecordsDeleted}`);
        console.log(`   • Contatori ID resettati (selettivi): ✅`);
        console.log('\n✨ Database pulito con successo!');
        console.log('👑 Gli utenti admin sono stati preservati');
        console.log('💡 La struttura delle tabelle è stata mantenuta');
        
        // Verifica lo stato prima di chiudere
        await verifyCleanDatabase();
        
    } catch (error) {
        console.error('\n💥 Errore durante la pulizia del database:', error);
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

/**
 * Funzione per verificare lo stato del database dopo la pulizia
 */
function verifyCleanDatabase() {
    return new Promise((resolve, reject) => {
        console.log('\n🔍 Verifica stato database...');
        
        // Controlla tutte le tabelle (incluso admin)
        const allTables = ['admin', ...tablesToClearCompletely];
        
        const checkQueries = allTables.map(table => {
            return new Promise((resolveTable, rejectTable) => {
                db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
                    if (err) {
                        rejectTable(err);
                    } else {
                        const status = table === 'admin' ? '👑 (preservati)' : '🧹 (pulita)';
                        console.log(`   📋 ${table}: ${row.count} record ${status}`);
                        resolveTable({ table, count: row.count });
                    }
                });
            });
        });
        
        Promise.all(checkQueries)
            .then(results => {
                const adminCount = results.find(r => r.table === 'admin')?.count || 0;
                const otherTablesTotal = results
                    .filter(r => r.table !== 'admin')
                    .reduce((sum, r) => sum + r.count, 0);
                
                console.log(`\n📊 Riepilogo verifica:`);
                console.log(`   👑 Admin preservati: ${adminCount}`);
                console.log(`   🧹 Record in altre tabelle: ${otherTablesTotal}`);
                
                if (otherTablesTotal === 0) {
                    console.log('✅ Verifica completata: pulizia perfetta (admin preservati)');
                } else {
                    console.log(`⚠️  Attenzione: trovati ancora ${otherTablesTotal} record nelle tabelle pulite`);
                }
                
                resolve({ adminCount, otherTablesTotal });
            })
            .catch(reject);
    });
}

// Esecuzione dello script con conferma
if (require.main === module) {
    console.log('⚠️  ATTENZIONE: Questo script eliminerà la maggior parte dei dati dal database!');
    console.log('👑 Gli utenti ADMIN saranno PRESERVATI');
    console.log('🗑️  Tutti gli altri utenti (PR, Pre-Admin) saranno ELIMINATI');
    console.log('📊 I dati correlati agli admin (tavoli, guadagni, etc.) saranno ELIMINATI');
    console.log('🛡️  La struttura delle tabelle sarà mantenuta');
    console.log('📝 Per procedere, avvia lo script con: node clear-database.js --confirm\n');
    
    // Controlla se è stata fornita la conferma
    const args = process.argv.slice(2);
    if (args.includes('--confirm')) {
        clearDatabase()
            .then(() => {
                console.log('\n🎉 Operazione completata con successo!');
                process.exit(0);
            })
            .catch((error) => {
                console.error('💥 Errore fatale:', error);
                process.exit(1);
            });
    } else {
        console.log('❌ Operazione annullata - aggiungi --confirm per procedere');
        console.log('💡 Ricorda: gli admin saranno preservati, ma i loro dati correlati saranno eliminati');
        process.exit(0);
    }
}

module.exports = {
    clearDatabase,
    clearTable,
    clearAdminRelatedData,
    resetAutoIncrement,
    resetAutoIncrementSelective,
    verifyCleanDatabase
};
