/**
 * Script di inizializzazione per Railway
 * Esegue automaticamente la creazione delle tabelle e l'admin di default
 */

const { initDB, creaAdminDefault } = require('./models/db');

console.log('🚀 Inizializzazione database per Railway...');

// Forza l'inizializzazione
initDB();

// Aspetta un po' e poi crea l'admin default
setTimeout(() => {
  creaAdminDefault();
  console.log('✅ Database inizializzato per Railway');
  console.log('👤 Admin default creato (username: admin, password: admin)');
  console.log('🔧 Tutte le tabelle sono state create');
  
  // Non chiudere il processo - lascia che Railway gestisca
}, 2000);
