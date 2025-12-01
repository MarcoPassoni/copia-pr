# 🚀 DEPLOYMENT SICURO - ICONIC Dashboard

## PRE-DEPLOYMENT CHECKLIST

### 1. Verifica Ambiente Produzione
```bash
# Controlla variabili ambiente
echo $SESSION_SECRET
echo $ENCRYPTION_KEY
echo $NODE_ENV

# Deve essere "production"
export NODE_ENV=production
```

### 2. Installazione Dipendenze Sicurezza
```bash
npm install helmet express-rate-limit express-validator winston bcrypt
npm audit fix
```

### 3. Applicazione Rate Limiting
Aggiungi ai tuoi routes:
```javascript
const { loginLimiter, apiLimiter, adminLimiter } = require('./utils/rate-limiter');

// Login endpoint
app.post('/login', loginLimiter, ...);

// API endpoints
app.use('/api', apiLimiter);

// Admin endpoints  
app.use('/admin', adminLimiter);
```

### 4. Applicazione Input Validation
Esempio per route utente:
```javascript
const { validationRules } = require('./utils/input-validator');

app.post('/admin/users', validationRules.createUser, (req, res) => {
    // Dati già validati e sanitizzati
    // Processa richiesta...
});
```

### 5. Setup HTTPS (Railway/Heroku)
```javascript
// Nel server.js
app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});
```

### 6. Monitoring e Logs
```bash
# Controlla logs sicurezza
tail -f logs/security.log

# Controlla errori applicazione
tail -f logs/error.log
```

## POST-DEPLOYMENT VERIFICATION

### Test Sicurezza Rapidi:
```bash
# Test rate limiting
curl -X POST https://your-app.railway.app/login -d "username=test&password=test" -H "Content-Type: application/x-www-form-urlencoded"

# Test security headers
curl -I https://your-app.railway.app

# Verifica HTTPS redirect
curl -I http://your-app.railway.app
```

### Dovrebbero essere presenti:
- ✅ Strict-Transport-Security header
- ✅ Content-Security-Policy header  
- ✅ X-Frame-Options: DENY
- ✅ X-Content-Type-Options: nosniff
- ✅ Redirect HTTP -> HTTPS

## MAINTENANCE

### Audit Sicurezza Periodico:
```bash
# Ogni settimana
npm audit
node vulnerability-test.js

# Aggiornamenti dipendenze (mensile)
npm update
npm audit fix
```

### Rotation Secrets (ogni 3 mesi):
```bash
# Genera nuovi secrets
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

## INCIDENT RESPONSE

### In caso di breach sospetto:
1. Rotazione immediata tutti i secrets
2. Invalidazione tutte le sessioni attive  
3. Review logs sicurezza ultimi 7 giorni
4. Cambio password tutti gli admin
5. Notifica utenti se necessario

## BACKUP SICURO

```bash
# Backup database con crittografia
sqlite3 iconic.db ".backup encrypted-backup-$(date +%Y%m%d).db"
gpg --symmetric --cipher-algo AES256 encrypted-backup-*.db
```

---
🔒 **REMEMBER**: Security is an ongoing process, not a one-time setup!
