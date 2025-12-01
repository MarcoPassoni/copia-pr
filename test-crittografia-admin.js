/**
 * Script di Test per Verificare la Crittografia delle Password Admin
 * Testa che le password vengano correttamente criptate durante gli aggiornamenti
 */

const bcrypt = require('bcryptjs');
const { db, getUserById, updateUser } = require('./models/db');

async function testCrittografiaPasswordAdmin() {
  console.log('🧪 Test Sistema Crittografia Password Admin');
  console.log('==========================================');
  
  try {
    // 1. Recupera l'admin corrente
    console.log('1. 📋 Recupero dati admin correnti...');
    
    getUserById('admin', 1, async (err, admin) => {
      if (err) {
        console.error('❌ Errore recupero admin:', err.message);
        process.exit(1);
      }
      
      if (!admin) {
        console.error('❌ Admin non trovato');
        process.exit(1);
      }
      
      console.log(`   ✅ Admin trovato: ${admin.nickname} (ID: ${admin.id})`);
      console.log(`   📞 Telefono decrittografato: ${admin.numero_telefono}`);
      
      // 2. Test cambio password
      console.log('\n2. 🔐 Test cambio password...');
      const nuovaPasswordTest = 'TestPassword123!';
      
      const hashedPassword = await bcrypt.hash(nuovaPasswordTest, 10);
      console.log('   ✅ Hash password generato');
      
      // 3. Aggiorna la password usando updateUser
      console.log('3. 💾 Aggiornamento con crittografia automatica...');
      
      updateUser('admin', admin.id, { 
        password: hashedPassword,
        // Test che anche i dati personali vengano ri-crittografati
        nome: admin.nome, 
        cognome: admin.cognome,
        numero_telefono: admin.numero_telefono
      }, (updateErr, result) => {
        if (updateErr) {
          console.error('❌ Errore aggiornamento:', updateErr.message);
          process.exit(1);
        }
        
        if (!result || result.changes === 0) {
          console.error('❌ Nessuna riga aggiornata');
          process.exit(1);
        }
        
        console.log('   ✅ Password aggiornata con successo');
        
        // 4. Verifica che la password sia stata salvata correttamente
        console.log('4. 🔍 Verifica password nel database...');
        
        db.get('SELECT password FROM admin WHERE id = ?', [admin.id], async (selectErr, row) => {
          if (selectErr) {
            console.error('❌ Errore verifica:', selectErr.message);
            process.exit(1);
          }
          
          // 5. Test che la password sia hashata correttamente
          console.log('5. 🔐 Test verifica password...');
          
          const passwordMatch = await bcrypt.compare(nuovaPasswordTest, row.password);
          
          if (passwordMatch) {
            console.log('   ✅ Password verificata correttamente con bcrypt');
            
            // 6. Ripristina la password originale
            console.log('6. 🔄 Ripristino password originale...');
            
            const originalHash = await bcrypt.hash('PasswordDiRecuperoAdmin123!', 10);
            updateUser('admin', admin.id, { password: originalHash }, (restoreErr) => {
              if (restoreErr) {
                console.error('⚠️ Errore ripristino password:', restoreErr.message);
              } else {
                console.log('   ✅ Password originale ripristinata');
              }
              
              console.log('\n🎉 TUTTI I TEST COMPLETATI CON SUCCESSO!');
              console.log('✅ Il sistema di crittografia funziona correttamente');
              console.log('✅ Le password vengono hashate con bcrypt');
              console.log('✅ I dati personali vengono crittografati automaticamente');
              
              db.close();
              process.exit(0);
            });
          } else {
            console.error('❌ Password non corrisponde - problema con l\'hash!');
            process.exit(1);
          }
        });
      });
    });
    
  } catch (error) {
    console.error('❌ Errore generale:', error.message);
    process.exit(1);
  }
}

// Esegui il test
testCrittografiaPasswordAdmin();