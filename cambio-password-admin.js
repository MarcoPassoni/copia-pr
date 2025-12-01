/**
 * Script di Recupero Password Admin
 * Aggiorna la password dell'admin nel database con crittografia corretta
 */

const bcrypt = require('bcryptjs');
const { db, updateUser } = require('./models/db');

async function cambioPasswordAdmin() {
  console.log('🔧 Avvio cambio password admin...');
  
  const nuovaPassword = 'PasswordDiRecuperoAdmin123!';
  
  try {
    // 1. Verifica che esista un admin
    db.get('SELECT id, nickname FROM admin WHERE nickname = ?', ['admin'], async (err, adminRow) => {
      if (err) {
        console.error('❌ Errore query database:', err.message);
        process.exit(1);
      }
      
      if (!adminRow) {
        console.error('❌ Admin non trovato nel database');
        process.exit(1);
      }
      
      console.log(`📋 Admin trovato: ID ${adminRow.id}, nickname: ${adminRow.nickname}`);
      
      try {
        // 2. Genera hash della nuova password con bcrypt
        console.log('🔐 Generazione hash password...');
        const hashedPassword = await bcrypt.hash(nuovaPassword, 10);
        console.log('✅ Hash password generato con successo');
        
        // 3. Aggiorna la password usando la funzione updateUser per mantenere la crittografia
        console.log('💾 Aggiornamento password nel database...');
        updateUser('admin', adminRow.id, { password: hashedPassword }, (updateErr, result) => {
          if (updateErr) {
            console.error('❌ Errore aggiornamento password:', updateErr.message);
            process.exit(1);
          }
          
          if (result && result.changes > 0) {
            console.log('✅ Password admin aggiornata con successo!');
            console.log('📝 Nuove credenziali:');
            console.log('   Username: admin');
            console.log(`   Password: ${nuovaPassword}`);
            console.log('');
            console.log('🔒 La password è stata correttamente hashata con bcrypt e salvata nel database.');
            console.log('🚀 Ora puoi accedere all\'applicazione con le nuove credenziali.');
            
            // Chiudi la connessione al database
            db.close((closeErr) => {
              if (closeErr) {
                console.error('⚠️ Errore chiusura database:', closeErr.message);
              }
              process.exit(0);
            });
          } else {
            console.error('❌ Nessuna riga aggiornata. Verifica l\'ID admin.');
            process.exit(1);
          }
        });
        
      } catch (hashError) {
        console.error('❌ Errore generazione hash password:', hashError.message);
        process.exit(1);
      }
    });
    
  } catch (error) {
    console.error('❌ Errore generale:', error.message);
    process.exit(1);
  }
}

// Gestione degli errori non catturati
process.on('uncaughtException', (error) => {
  console.error('❌ Errore non gestito:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rifiutata:', reason);
  process.exit(1);
});

// Esegui lo script
cambioPasswordAdmin();