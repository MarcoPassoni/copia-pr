/**
 * Debug dettagliato del processo di login
 */
const bcrypt = require('bcryptjs');
const { getUserByNickname } = require('./models/db');

console.log('🔍 DEBUG LOGIN DETTAGLIATO\n');

const testCredentials = {
    nickname: 'admin',
    password: 'PasswordDiRecuperoAdmin123!'
};

console.log('🧪 Test con credenziali:');
console.log('   Username:', testCredentials.nickname);
console.log('   Password:', testCredentials.password);

// Simula esattamente quello che fa il login
console.log('\n1. 📋 Ricerca utente nella tabella admin...');

getUserByNickname('admin', testCredentials.nickname, (err, user) => {
    if (err) {
        console.log('❌ Errore ricerca utente:', err.message);
        process.exit(1);
    }
    
    if (!user) {
        console.log('❌ Utente non trovato nella tabella admin');
        process.exit(1);
    }
    
    console.log('✅ Utente trovato:');
    console.log('   ID:', user.id);
    console.log('   Nickname:', user.nickname);
    console.log('   Nome:', user.nome);
    console.log('   Cognome:', user.cognome);
    console.log('   Password hash:', user.password.substring(0, 20) + '...');
    
    console.log('\n2. 🔐 Verifica password con bcrypt.compare...');
    console.log('   Input password:', testCredentials.password);
    console.log('   Stored hash:', user.password);
    
    bcrypt.compare(testCredentials.password, user.password, (err, result) => {
        if (err) {
            console.log('❌ Errore bcrypt.compare:', err.message);
            process.exit(1);
        }
        
        console.log('✅ Risultato bcrypt.compare:', result);
        
        if (result) {
            console.log('\n🎉 LOGIN DOVREBBE FUNZIONARE!');
            console.log('✅ Password corretta');
            console.log('✅ Utente valido');
            console.log('✅ Ruolo: admin');
            console.log('✅ Redirect dovrebbe andare a: /admin/staff');
        } else {
            console.log('\n❌ LOGIN FALLISCE: Password non corretta');
            console.log('🔍 Possibili cause:');
            console.log('   - Password cambiata dopo il test');
            console.log('   - Problema con encoding caratteri');
            console.log('   - Hash corrotto nel database');
        }
    });
});