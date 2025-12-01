const bcrypt = require('bcryptjs');
const { db, insertUser } = require('./models/db');

async function createAdmin() {
  console.log('🔧 Creazione admin di default...');
  
  try {
    // Hash della password
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Dati dell'admin
    const adminData = {
      id: 1000001,
      nome: 'Admin',
      cognome: 'Admin',
      numero_telefono: '1234567890',
      nickname: 'admin',
      password: hashedPassword
    };
    
    // Inserisci admin
    insertUser('admin', adminData, (err, result) => {
      if (err) {
        console.error('❌ Errore creazione admin:', err.message);
        process.exit(1);
      } else {
        console.log('✅ Admin creato con successo!');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   ID:', adminData.id);
        process.exit(0);
      }
    });
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
    process.exit(1);
  }
}

createAdmin();
