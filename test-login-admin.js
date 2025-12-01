/**
 * Test rapido login admin
 */
const bcrypt = require('bcrypt');
const { getUserByNickname } = require('./models/db');

console.log('🔐 Test login admin...\n');

const testPassword = 'PasswordDiRecuperoAdmin123!';

getUserByNickname('admin', 'admin', (err, user) => {
    if (err) {
        console.log('❌ Errore database:', err.message);
        process.exit(1);
    }
    
    if (!user) {
        console.log('❌ Admin non trovato');
        process.exit(1);
    }
    
    console.log('✅ Admin trovato nel database:');
    console.log('   ID:', user.id);
    console.log('   Nickname:', user.nickname);
    console.log('   Nome:', user.nome);
    console.log('   Cognome:', user.cognome);
    console.log('   Hash password presente:', user.password ? 'SÌ' : 'NO');
    
    if (user.password) {
        console.log('\n🔐 Test password "admin123"...');
        
        bcrypt.compare(testPassword, user.password, (err, result) => {
            if (err) {
                console.log('❌ Errore verifica password:', err.message);
            } else {
                console.log('✅ Password "admin123":', result ? 'CORRETTA' : 'SBAGLIATA');
                
                if (!result) {
                    console.log('\n🔄 Test altre password comuni...');
                    const testPasswords = ['admin', '123456', 'password', 'iconic123'];
                    
                    let testIndex = 0;
                    function testNext() {
                        if (testIndex >= testPasswords.length) {
                            console.log('\n❌ Nessuna password testata funziona');
                            console.log('💡 Usa il cambio-password-admin.js per resettare');
                            process.exit(0);
                        }
                        
                        const pwd = testPasswords[testIndex];
                        bcrypt.compare(pwd, user.password, (err, result) => {
                            console.log(`   Password "${pwd}":`, result ? '✅ CORRETTA' : '❌ Sbagliata');
                            if (result) {
                                console.log(`\n🎉 PASSWORD TROVATA: "${pwd}"`);
                                console.log('Usa queste credenziali:');
                                console.log(`   Username: admin`);
                                console.log(`   Password: ${pwd}`);
                                process.exit(0);
                            }
                            testIndex++;
                            testNext();
                        });
                    }
                    testNext();
                } else {
                    console.log('\n🎉 CREDENZIALI CORRETTE:');
                    console.log('   Username: admin');
                    console.log('   Password: admin123');
                }
            }
        });
    }
});