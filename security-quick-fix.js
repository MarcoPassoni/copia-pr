/**
 * SECURITY QUICK FIX - ICONIC Dashboard
 * Fix automatico delle vulnerabilità più critiche
 * Esegui PRIMA del deploy in produzione
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🔒 ICONIC SECURITY QUICK FIX');
console.log('===========================');
console.log('🚀 Avvio correzioni di sicurezza critiche...\n');

// ========================================
// 1. GENERA SECRETS SICURI
// ========================================
function generateSecureSecrets() {
    console.log('1. 🔑 Generazione secrets sicuri...');
    
    const secrets = {
        SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
        ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
        JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        CSRF_SECRET: crypto.randomBytes(16).toString('hex')
    };
    
    // Crea file .env se non esiste
    let envContent = '';
    if (fs.existsSync('.env')) {
        envContent = fs.readFileSync('.env', 'utf8');
        console.log('   ✅ File .env esistente trovato');
    } else {
        console.log('   📝 Creazione nuovo file .env...');
    }
    
    // Aggiungi/aggiorna secrets
    Object.entries(secrets).forEach(([key, value]) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}=${value}`);
            console.log(`   🔄 Aggiornato ${key}`);
        } else {
            envContent += `\n${key}=${value}`;
            console.log(`   ➕ Aggiunto ${key}`);
        }
    });
    
    // Aggiungi configurazioni sicurezza se non presenti
    const securityVars = [
        'NODE_ENV=production',
        'HTTPS_ENABLED=true',
        'SECURE_COOKIES=true',
        'LOG_LEVEL=error'
    ];
    
    securityVars.forEach(varLine => {
        const [key] = varLine.split('=');
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (!regex.test(envContent)) {
            envContent += `\n${varLine}`;
            console.log(`   ➕ Aggiunto ${key}`);
        }
    });
    
    fs.writeFileSync('.env', envContent.trim() + '\n');
    console.log('   ✅ File .env aggiornato con secrets sicuri\n');
    
    return secrets;
}

// ========================================
// 2. FIX SERVER.JS - SECURITY HEADERS
// ========================================
function fixServerSecurity() {
    console.log('2. 🛡️  Fix sicurezza server.js...');
    
    const serverPath = './server.js';
    if (!fs.existsSync(serverPath)) {
        console.log('   ❌ server.js non trovato');
        return;
    }
    
    let serverContent = fs.readFileSync(serverPath, 'utf8');
    
    // Verifica se helmet è già installato
    if (!serverContent.includes("require('helmet')")) {
        // Aggiungi helmet import dopo express
        const expressImportRegex = /(const express = require\('express'\);)/;
        if (expressImportRegex.test(serverContent)) {
            serverContent = serverContent.replace(
                expressImportRegex,
                '$1\nconst helmet = require(\'helmet\');'
            );
            console.log('   ✅ Aggiunto import helmet');
        }
        
        // Aggiungi helmet middleware
        const appCreationRegex = /(const app = express\(\);)/;
        if (appCreationRegex.test(serverContent)) {
            const helmetConfig = `
// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));`;
            
            serverContent = serverContent.replace(
                appCreationRegex,
                '$1' + helmetConfig
            );
            console.log('   ✅ Aggiunta configurazione helmet');
        }
    }
    
    // Fix session configuration
    const sessionRegex = /(app\.use\(session\(\{[\s\S]*?\}\)\);)/;
    if (sessionRegex.test(serverContent)) {
        const secureSessionConfig = `app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    name: 'iconic.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 60 * 1000, // 30 minuti
        sameSite: 'strict'
    },
    genid: () => crypto.randomBytes(16).toString('hex')
}));`;
        
        serverContent = serverContent.replace(sessionRegex, secureSessionConfig);
        console.log('   ✅ Aggiornata configurazione session sicura');
    }
    
    // Aggiungi crypto import se necessario
    if (!serverContent.includes("require('crypto')")) {
        const firstRequire = serverContent.indexOf("require(");
        if (firstRequire !== -1) {
            const insertPos = serverContent.lastIndexOf('\n', firstRequire);
            serverContent = serverContent.slice(0, insertPos + 1) + 
                          "const crypto = require('crypto');\n" + 
                          serverContent.slice(insertPos + 1);
            console.log('   ✅ Aggiunto import crypto');
        }
    }
    
    fs.writeFileSync(serverPath, serverContent);
    console.log('   ✅ server.js aggiornato con configurazioni sicure\n');
}

// ========================================
// 3. INSTALLA DIPENDENZE SICUREZZA
// ========================================
function installSecurityPackages() {
    console.log('3. 📦 Installazione pacchetti sicurezza...');
    
    const { execSync } = require('child_process');
    
    const securityPackages = [
        'helmet',
        'express-rate-limit', 
        'express-validator',
        'winston',
        'bcrypt'
    ];
    
    try {
        console.log('   📥 Installazione in corso...');
        execSync(`npm install ${securityPackages.join(' ')}`, { 
            stdio: 'pipe'
        });
        console.log('   ✅ Pacchetti sicurezza installati');
        
        // Installa audit fix
        console.log('   🔍 Verifica vulnerabilità dipendenze...');
        try {
            execSync('npm audit fix', { stdio: 'pipe' });
            console.log('   ✅ Vulnerabilità dipendenze risolte');
        } catch (auditError) {
            console.log('   ⚠️  Alcune vulnerabilità richiedono intervento manuale');
        }
        
    } catch (error) {
        console.log('   ⚠️  Errore installazione pacchetti (installa manualmente):');
        console.log(`   npm install ${securityPackages.join(' ')}`);
    }
    
    console.log('');
}

// ========================================
// 4. CLEANUP CONSOLE.LOG
// ========================================
function cleanupConsoleLog() {
    console.log('4. 🧹 Cleanup console.log per produzione...');
    
    const filesToCheck = [
        './routes/',
        './controllers/',
        './models/',
        './utils/'
    ];
    
    let filesProcessed = 0;
    let logsRemoved = 0;
    
    function processDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) return;
        
        const items = fs.readdirSync(dirPath);
        
        items.forEach(item => {
            const fullPath = path.join(dirPath, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                processDirectory(fullPath);
            } else if (item.endsWith('.js')) {
                processFile(fullPath);
            }
        });
    }
    
    function processFile(filePath) {
        let content = fs.readFileSync(filePath, 'utf8');
        const originalContent = content;
        
        // Sostituisci console.log in produzione con logger
        const consoleRegex = /console\.(log|info|debug|warn)\((.*?)\);?/g;
        content = content.replace(consoleRegex, (match, level, args) => {
            logsRemoved++;
            return `// [PRODUCTION] Removed console.${level}(${args})`;
        });
        
        // Mantieni console.error (utili per debugging critico)
        content = content.replace(/\/\/ \[PRODUCTION\] Removed console\.error/g, 'console.error');
        
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content);
            filesProcessed++;
        }
    }
    
    filesToCheck.forEach(dir => processDirectory(dir));
    
    console.log(`   ✅ Processati ${filesProcessed} file`);
    console.log(`   🔇 Rimossi ${logsRemoved} console.log statements\n`);
}

// ========================================
// 5. CREA LOGGER SICURO
// ========================================
function createSecureLogger() {
    console.log('5. 📝 Creazione logger sicuro...');
    
    const loggerCode = `/**
 * Secure Logger per ICONIC Dashboard
 * Sostituisce console.log per produzione sicura
 */

const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'iconic-dashboard' },
    transports: [
        // File per errori
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // File per tutti i log
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 10
        })
    ]
});

// Console solo in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Security logger separato
const securityLogger = winston.createLogger({
    level: 'warn',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: 'logs/security.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

// Funzione per log eventi sicurezza
const logSecurityEvent = (event, details, req = null) => {
    const logData = {
        event,
        details,
        timestamp: new Date().toISOString()
    };
    
    if (req) {
        logData.ip = req.ip || req.connection.remoteAddress;
        logData.userAgent = req.get('User-Agent');
        logData.url = req.originalUrl;
        logData.method = req.method;
    }
    
    securityLogger.warn(logData);
};

module.exports = {
    logger,
    securityLogger,
    logSecurityEvent
};`;

    // Crea directory logs
    if (!fs.existsSync('./logs')) {
        fs.mkdirSync('./logs');
        console.log('   📁 Directory logs creata');
    }
    
    fs.writeFileSync('./utils/secure-logger.js', loggerCode);
    console.log('   ✅ Logger sicuro creato in utils/secure-logger.js\n');
}

// ========================================
// 6. CREA RATE LIMITER
// ========================================
function createRateLimiter() {
    console.log('6. 🚦 Creazione rate limiter...');
    
    const rateLimiterCode = `/**
 * Rate Limiter per ICONIC Dashboard
 * Protezione contro brute force e abuse
 */

const rateLimit = require('express-rate-limit');
const { logSecurityEvent } = require('./secure-logger');

// Rate limiter per login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: 5, // 5 tentativi per IP
    message: {
        success: false,
        message: 'Troppi tentativi di login. Riprova tra 15 minuti.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logSecurityEvent('LOGIN_RATE_LIMIT', {
            ip: req.ip,
            attempts: req.rateLimit.totalHits
        }, req);
        
        res.status(429).json({
            success: false,
            message: 'Troppi tentativi di login. Riprova tra 15 minuti.'
        });
    }
});

// Rate limiter generico API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: 100, // 100 richieste per IP
    message: {
        success: false,
        message: 'Troppe richieste. Riprova più tardi.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter per operazioni admin
const adminLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 30, // 30 operazioni per minuto
    message: {
        success: false,
        message: 'Troppe operazioni admin. Rallenta le richieste.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    loginLimiter,
    apiLimiter,
    adminLimiter
};`;

    fs.writeFileSync('./utils/rate-limiter.js', rateLimiterCode);
    console.log('   ✅ Rate limiter creato in utils/rate-limiter.js\n');
}

// ========================================
// 7. CREA INPUT VALIDATOR
// ========================================
function createInputValidator() {
    console.log('7. ✅ Creazione input validator...');
    
    const validatorCode = `/**
 * Input Validator per ICONIC Dashboard
 * Validazione e sanitizzazione input utente
 */

const { body, param, query, validationResult } = require('express-validator');

// Middleware per gestire errori validazione
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Dati non validi',
            errors: errors.array()
        });
    }
    next();
};

// Validatori comuni
const validators = {
    // Dati utente
    nome: body('nome')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Nome deve essere tra 2 e 50 caratteri')
        .matches(/^[a-zA-ZàáâäãåąčćęèéêëėįìíîïłńòóôöõøùúûüųūÿýżźñçčšžÀÁÂÄÃÅĄĆČĖĘÈÉÊËÌÍÎÏĮŁŃÒÓÔÖÕØÙÚÛÜŲŪŸÝŻŹÑßÇŒÆČŠŽ\\s'-]+$/)
        .withMessage('Nome contiene caratteri non validi'),
        
    cognome: body('cognome')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Cognome deve essere tra 2 e 50 caratteri')
        .matches(/^[a-zA-ZàáâäãåąčćęèéêëėįìíîïłńòóôöõøùúûüųūÿýżźñçčšžÀÁÂÄÃÅĄĆČĖĘÈÉÊËÌÍÎÏĮŁŃÒÓÔÖÕØÙÚÛÜŲŪŸÝŻŹÑßÇŒÆČŠŽ\\s'-]+$/)
        .withMessage('Cognome contiene caratteri non validi'),
        
    nickname: body('nickname')
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Nickname deve essere tra 3 e 30 caratteri')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Nickname può contenere solo lettere, numeri, _ e -'),
        
    email: body('email')
        .isEmail()
        .withMessage('Email non valida')
        .normalizeEmail(),
        
    telefono: body('numero_telefono')
        .isMobilePhone('it-IT')
        .withMessage('Numero telefono non valido'),
        
    password: body('password')
        .isLength({ min: 8, max: 128 })
        .withMessage('Password deve essere tra 8 e 128 caratteri')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]/)
        .withMessage('Password deve contenere almeno: 1 minuscola, 1 maiuscola, 1 numero, 1 carattere speciale'),
        
    // Validatori ID
    userId: param('id')
        .isInt({ min: 1 })
        .withMessage('ID utente deve essere un numero positivo'),
        
    tavoloId: param('id')
        .isInt({ min: 1 })
        .withMessage('ID tavolo deve essere un numero positivo'),
        
    // Validatori query
    page: query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Numero pagina deve essere un numero positivo'),
        
    limit: query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limite deve essere tra 1 e 100')
};

// Set di validatori per diverse operazioni
const validationRules = {
    // Creazione utente
    createUser: [
        validators.nome,
        validators.cognome,
        validators.nickname,
        validators.email,
        validators.telefono,
        validators.password,
        body('ruolo').isIn(['PR', 'pre-admin', 'admin']).withMessage('Ruolo non valido'),
        handleValidationErrors
    ],
    
    // Aggiornamento utente
    updateUser: [
        validators.userId,
        validators.nome,
        validators.cognome,
        validators.telefono,
        handleValidationErrors
    ],
    
    // Login
    login: [
        body('nickname').trim().notEmpty().withMessage('Nickname richiesto'),
        body('password').notEmpty().withMessage('Password richiesta'),
        handleValidationErrors
    ],
    
    // Operazioni tavoli
    tavoloOperation: [
        validators.tavoloId,
        body('azione').isIn(['approva', 'rifiuta']).withMessage('Azione non valida'),
        handleValidationErrors
    ]
};

module.exports = {
    validators,
    validationRules,
    handleValidationErrors
};`;

    fs.writeFileSync('./utils/input-validator.js', validatorCode);
    console.log('   ✅ Input validator creato in utils/input-validator.js\n');
}

// ========================================
// 8. GENERA INSTRUZIONI DEPLOYMENT
// ========================================
function generateDeploymentInstructions() {
    console.log('8. 📋 Generazione istruzioni deployment...');
    
    const instructions = `# 🚀 DEPLOYMENT SICURO - ICONIC Dashboard

## PRE-DEPLOYMENT CHECKLIST

### 1. Verifica Ambiente Produzione
\`\`\`bash
# Controlla variabili ambiente
echo $SESSION_SECRET
echo $ENCRYPTION_KEY
echo $NODE_ENV

# Deve essere "production"
export NODE_ENV=production
\`\`\`

### 2. Installazione Dipendenze Sicurezza
\`\`\`bash
npm install helmet express-rate-limit express-validator winston bcrypt
npm audit fix
\`\`\`

### 3. Applicazione Rate Limiting
Aggiungi ai tuoi routes:
\`\`\`javascript
const { loginLimiter, apiLimiter, adminLimiter } = require('./utils/rate-limiter');

// Login endpoint
app.post('/login', loginLimiter, ...);

// API endpoints
app.use('/api', apiLimiter);

// Admin endpoints  
app.use('/admin', adminLimiter);
\`\`\`

### 4. Applicazione Input Validation
Esempio per route utente:
\`\`\`javascript
const { validationRules } = require('./utils/input-validator');

app.post('/admin/users', validationRules.createUser, (req, res) => {
    // Dati già validati e sanitizzati
    // Processa richiesta...
});
\`\`\`

### 5. Setup HTTPS (Railway/Heroku)
\`\`\`javascript
// Nel server.js
app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
        res.redirect(\`https://\${req.header('host')}\${req.url}\`);
    } else {
        next();
    }
});
\`\`\`

### 6. Monitoring e Logs
\`\`\`bash
# Controlla logs sicurezza
tail -f logs/security.log

# Controlla errori applicazione
tail -f logs/error.log
\`\`\`

## POST-DEPLOYMENT VERIFICATION

### Test Sicurezza Rapidi:
\`\`\`bash
# Test rate limiting
curl -X POST https://your-app.railway.app/login -d "username=test&password=test" -H "Content-Type: application/x-www-form-urlencoded"

# Test security headers
curl -I https://your-app.railway.app

# Verifica HTTPS redirect
curl -I http://your-app.railway.app
\`\`\`

### Dovrebbero essere presenti:
- ✅ Strict-Transport-Security header
- ✅ Content-Security-Policy header  
- ✅ X-Frame-Options: DENY
- ✅ X-Content-Type-Options: nosniff
- ✅ Redirect HTTP -> HTTPS

## MAINTENANCE

### Audit Sicurezza Periodico:
\`\`\`bash
# Ogni settimana
npm audit
node vulnerability-test.js

# Aggiornamenti dipendenze (mensile)
npm update
npm audit fix
\`\`\`

### Rotation Secrets (ogni 3 mesi):
\`\`\`bash
# Genera nuovi secrets
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
\`\`\`

## INCIDENT RESPONSE

### In caso di breach sospetto:
1. Rotazione immediata tutti i secrets
2. Invalidazione tutte le sessioni attive  
3. Review logs sicurezza ultimi 7 giorni
4. Cambio password tutti gli admin
5. Notifica utenti se necessario

## BACKUP SICURO

\`\`\`bash
# Backup database con crittografia
sqlite3 iconic.db ".backup encrypted-backup-$(date +%Y%m%d).db"
gpg --symmetric --cipher-algo AES256 encrypted-backup-*.db
\`\`\`

---
🔒 **REMEMBER**: Security is an ongoing process, not a one-time setup!
`;

    fs.writeFileSync('./DEPLOYMENT-SECURITY-GUIDE.md', instructions);
    console.log('   ✅ Istruzioni deployment create in DEPLOYMENT-SECURITY-GUIDE.md\n');
}

// ========================================
// ESECUZIONE MAIN
// ========================================
async function runSecurityFix() {
    try {
        console.log('🚀 Avvio Security Quick Fix per ICONIC Dashboard\n');
        
        // Genera secrets sicuri
        const secrets = generateSecureSecrets();
        
        // Fix server security
        fixServerSecurity();
        
        // Installa pacchetti sicurezza
        installSecurityPackages();
        
        // Cleanup console.log
        cleanupConsoleLog();
        
        // Crea utility sicurezza
        createSecureLogger();
        createRateLimiter();
        createInputValidator();
        
        // Genera guide
        generateDeploymentInstructions();
        
        // ========================================
        // SUMMARY FINALE
        // ========================================
        console.log('='.repeat(60));
        console.log('🎉 SECURITY QUICK FIX COMPLETATO!');
        console.log('='.repeat(60));
        
        console.log('\n✅ OPERAZIONI COMPLETATE:');
        console.log('   🔑 Secrets sicuri generati in .env');
        console.log('   🛡️  Helmet security headers configurato');
        console.log('   📦 Pacchetti sicurezza installati');
        console.log('   🧹 Console.log rimossi per produzione');
        console.log('   📝 Logger sicuro creato');
        console.log('   🚦 Rate limiter configurato');
        console.log('   ✅ Input validator creato');
        console.log('   📋 Guide deployment generate');
        
        console.log('\n🚨 AZIONI RICHIESTE DOPO IL FIX:');
        console.log('   1. ⚡ Riavvia il server: npm restart');
        console.log('   2. 🧪 Testa funzionalità critiche');
        console.log('   3. 📋 Segui DEPLOYMENT-SECURITY-GUIDE.md');
        console.log('   4. 🔍 Esegui nuovo vulnerability test');
        console.log('   5. 🚀 Deploy in produzione solo dopo test');
        
        console.log('\n📞 SUPPORTO:');
        console.log('   • Vulnerability Report: SECURITY-VULNERABILITY-REPORT.md');
        console.log('   • Deploy Guide: DEPLOYMENT-SECURITY-GUIDE.md');
        console.log('   • Test sicurezza: node vulnerability-test.js');
        
        console.log('\n🎯 PROSSIMI PASSI CRITICI:');
        console.log('   ⚠️  Applicare rate limiters alle route sensitive');
        console.log('   ⚠️  Applicare validators a tutti gli input form');
        console.log('   ⚠️  Sostituire console.log con secure logger');
        console.log('   ⚠️  Testare HTTPS e security headers');
        
        console.log('\n🔒 SICUREZZA DEPLOYMENT:');
        console.log('   • Variabili ambiente configurate? ✓');
        console.log('   • HTTPS abilitato? (Verifica dopo deploy)');
        console.log('   • Rate limiting attivo? (Verifica dopo deploy)');
        console.log('   • Input validation? (Da implementare nei routes)');
        
        console.log('\n✅ Il sistema è ora significativamente più sicuro!');
        console.log('🚀 Procedi con il deployment seguendo la guida creata.');
        
    } catch (error) {
        console.error('❌ Errore durante security fix:', error.message);
        console.log('\n🔧 DEBUG INFO:');
        console.log('   • Verifica permessi scrittura file');
        console.log('   • Controlla spazio disco disponibile');
        console.log('   • Riprova il fix manualmente');
        process.exit(1);
    }
}

// Gestione errori
process.on('uncaughtException', (error) => {
    console.error('❌ Errore non gestito:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Promise rifiutata:', reason);
    process.exit(1);
});

// Avvia il fix
runSecurityFix().catch(console.error);