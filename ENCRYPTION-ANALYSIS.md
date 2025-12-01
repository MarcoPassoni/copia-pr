# Analisi Completa della Crittografia dei Dati

## 📋 Indice
1. [Campi Crittografati](#campi-crittografati)
2. [Algoritmo e Configurazione](#algoritmo-e-configurazione)
3. [Flusso di Crittografia](#flusso-di-crittografia)
4. [Punti di Accesso](#punti-di-accesso)
5. [Vulnerabilità e Rischi](#vulnerabilità-e-rischi)
6. [Raccomandazioni](#raccomandazioni)

---

## 🔒 Campi Crittografati

### Dati Personali Sensibili (PII)
I seguenti campi vengono **sempre crittografati** in tutte le tabelle utente:

| Campo | Tipo | Tabelle Interessate | Motivo |
|-------|------|---------------------|---------|
| `nome` | STRING | admin, pre_admin, pr | Dato personale sensibile (GDPR) |
| `cognome` | STRING | admin, pre_admin, pr | Dato personale sensibile (GDPR) |
| `numero_telefono` | STRING | admin, pre_admin, pr | Dato di contatto sensibile |

### Campi NON Crittografati
I seguenti campi rimangono in **chiaro** per permettere query e ricerche:

| Campo | Tipo | Motivo |
|-------|------|--------|
| `id` | INTEGER | Chiave primaria, necessaria per JOIN |
| `nickname` | STRING | Credenziale di accesso, richiede ricerca esatta |
| `password` | HASH (bcrypt) | Hash unidirezionale (non crittografia reversibile) |
| `percentuale_provvigione` | DECIMAL | Dato non personale, necessario per calcoli |
| `fk_padre`, `fk_admin` | INTEGER | Chiavi esterne per relazioni |
| `poteri` | INTEGER | Flag booleano operativo |
| `attivo` | INTEGER | Flag soft-delete |
| `deleted_at` | TEXT | Timestamp operativo |

---

## 🔐 Algoritmo e Configurazione

### Algoritmo: AES-256-CBC

```javascript
algorithm: 'aes-256-cbc'
keyLength: 32 bytes (256 bits)
ivLength: 16 bytes (128 bits)
```

### Gestione Chiave di Crittografia

#### 1. **Environment Variable (Priorità Alta - Production)**
```javascript
if (process.env.ENCRYPTION_KEY) {
    this.key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
}
```
- Usata in produzione (Railway/deployment)
- Chiave in formato esadecimale

#### 2. **File System (Fallback - Development)**
```javascript
const keyPath = path.join(__dirname, '../.encryption-key');
if (fs.existsSync(keyPath)) {
    this.key = fs.readFileSync(keyPath);
} else {
    // Genera nuova chiave random
    this.key = crypto.randomBytes(this.keyLength);
    fs.writeFileSync(keyPath, this.key, { mode: 0o600 });
}
```
- File locale: `.encryption-key` (32 bytes raw)
- Permessi: `0o600` (solo proprietario)
- **CRITICO**: File NON versionato (in `.gitignore`)

### Formato Dati Crittografati

#### Struttura Output
```
[IV (16 bytes)] + [Encrypted Data (variabile)]
      ↓
  Base64 Encoded String
```

#### Esempio:
```javascript
// Plaintext:  "Mario"
// IV random:  [16 bytes casuali]
// Encrypted:  "T7x9..." (hex)
// Output:     "4kJp2L...==" (base64)
```

---

## 🔄 Flusso di Crittografia

### 1️⃣ **Inserimento Nuovo Utente**

#### Route: `POST /admin/staff/nuovo`
```javascript
// 1. Dati in arrivo (plaintext)
const userData = {
  nome: "Mario",
  cognome: "Rossi",
  numero_telefono: "3331234567",
  nickname: "mario.rossi",
  password: "password123"
};

// 2. Crittografia automatica tramite insertUser()
const encryptedData = encryptUserData(userData);
// {
//   nome: "4kJp2L...==",
//   cognome: "xT9m3...==",
//   numero_telefono: "zQ8k1...==",
//   nickname: "mario.rossi",  // NON crittografato
//   password: "password123"    // Sarà hashato con bcrypt
// }

// 3. Hash password
bcrypt.hash(password, 10, (hash) => {
  encryptedData.password = hash; // "$2b$10$..."
});

// 4. INSERT nel database
INSERT INTO pr (nome, cognome, numero_telefono, nickname, password, ...)
VALUES (?, ?, ?, ?, ?, ...)
```

**File coinvolti:**
- `routes/admin.js` → linee 359-395 (creazione staff)
- `models/db.js` → funzione `insertUser()` (linee 310-331)
- `utils/crypto.js` → funzione `encryptUserData()` (linee 155-171)

---

### 2️⃣ **Modifica Utente Esistente**

#### Route: `POST /admin/staff/edit`
```javascript
// 1. Dati modificati (plaintext)
const updateData = {
  nome: "Mario Aggiornato",
  cognome: "Rossi",
  numero_telefono: "3339876543",
  percentuale_provvigione: 10  // NON crittografato
};

// 2. Crittografia selettiva
const encryptedSensitive = encryptUserData({
  nome: updateData.nome,
  cognome: updateData.cognome,
  numero_telefono: updateData.numero_telefono
});

// 3. UPDATE database con dati crittografati
UPDATE pr 
SET nome = ?, cognome = ?, numero_telefono = ?, percentuale_provvigione = ?
WHERE id = ?
```

**File coinvolti:**
- `routes/admin.js` → linee 480-630 (modifica staff)
- `models/db.js` → funzione `updateUser()` (linee 338-375)
- `utils/crypto.js` → funzione `encryptUserData()` (linee 155-171)

---

### 3️⃣ **Lettura e Visualizzazione Dati**

#### Route: `GET /admin/staff`
```javascript
// 1. Query database (dati crittografati)
db.all('SELECT * FROM pr WHERE attivo = 1', [], (err, rows) => {
  // rows = [
  //   { id: 1, nome: "4kJp2L...==", cognome: "xT9m3...==", ... }
  // ]

  // 2. Decrittografia automatica
  const decryptedUsers = decryptUserArray(rows);
  // [
  //   { id: 1, nome: "Mario", cognome: "Rossi", ... }
  // ]

  // 3. Render template con dati in chiaro
  res.render('admin/staff', { staff: decryptedUsers });
});
```

**File coinvolti:**
- `routes/admin.js` → linee 164-250 (visualizzazione staff)
- `models/db.js` → funzione `getAllUsers()` (linee 407-443)
- `utils/crypto.js` → funzione `decryptUserArray()` (linee 200-210)

---

### 4️⃣ **Approvazione Richieste Creazione PR**

#### Route: `POST /admin/approva/:id`
```javascript
// 1. Legge richiesta (dati crittografati nel DB)
db.get('SELECT * FROM richieste_creazione_pr WHERE id = ?', [id], (err, richiesta) => {
  // richiesta.nome = "7xQ2k...==" (crittografato)
  
  // 2. Decrittografia manuale per elaborazione
  const decryptedRichiesta = decryptUserData({
    nome: richiesta.nome,
    cognome: richiesta.cognome,
    numero_telefono: richiesta.numero_telefono
  });
  
  // 3. Hash password
  const hashedPassword = await bcrypt.hash(richiesta.password, 10);
  
  // 4. INSERT con dati già crittografati (bypass encryptUserData)
  // ⚠️ PROBLEMA: I dati vengono inseriti SENZA ri-crittografare
  INSERT INTO pr (nome, cognome, numero_telefono, password, ...)
  VALUES (?, ?, ?, ?, ...)
  // Usa direttamente richiesta.nome (già crittografato)
});
```

**File coinvolti:**
- `routes/admin.js` → linee 1980-2050 (approvazione richiesta)
- `models/db.js` → funzione `decryptUserData()` (linee 179-195)

---

## 📍 Punti di Accesso ai Dati Crittografati

### Visualizzazione Dati (Decrittografia)

| Route | File | Linea | Operazione |
|-------|------|-------|------------|
| `GET /admin/staff` | `routes/admin.js` | 171 | Decrittografia lista PR per visualizzazione |
| `GET /admin/approvazioni` | `routes/admin.js` | 1874-1892 | Decrittografia richiedente e padre PR |
| `GET /pr/dashboard` | `routes/pr.js` | ~ | Decrittografia dati profilo PR |
| `GET /admin/database` | `routes/admin.js` | 2100+ | Visualizzazione raw database (con decrittografia) |

### Scrittura Dati (Crittografia)

| Route | File | Linea | Operazione |
|-------|------|-------|------------|
| `POST /admin/staff/nuovo` | `routes/admin.js` | 359 | Crittografia nuovo utente (admin/pre_admin/pr) |
| `POST /admin/staff/edit` | `routes/admin.js` | 480-630 | Crittografia dati modificati |
| `POST /admin/approva/:id` | `routes/admin.js` | 1987-2010 | **⚠️ POSSIBILE BUG**: Inserimento senza ri-crittografare |
| Creazione admin default | `models/db.js` | 284-290 | Crittografia dati admin iniziale |

---

## ⚠️ Vulnerabilità e Rischi

### 🔴 CRITICO

#### 1. **Assenza di MAC/HMAC (Message Authentication Code)**
```javascript
// Attuale implementazione
encrypt(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
  return Buffer.concat([iv, Buffer.from(encrypted, 'hex')]).toString('base64');
}
```

**Problema:**
- ❌ Nessuna verifica di integrità
- ❌ Possibile tampering: attaccante può modificare ciphertext senza essere rilevato
- ❌ Vulnerabile a Padding Oracle Attacks in scenari specifici

**Soluzione:**
```javascript
// Implementazione sicura con HMAC
encrypt(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  
  // Aggiungi HMAC
  const hmac = crypto.createHmac('sha256', this.authKey);
  hmac.update(Buffer.concat([iv, encrypted]));
  const tag = hmac.digest();
  
  // Formato: [IV (16)] + [Encrypted (var)] + [HMAC (32)]
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

decrypt(encryptedData) {
  const combined = Buffer.from(encryptedData, 'base64');
  const iv = combined.subarray(0, 16);
  const encrypted = combined.subarray(16, combined.length - 32);
  const receivedTag = combined.subarray(combined.length - 32);
  
  // Verifica HMAC PRIMA di decrittografare
  const hmac = crypto.createHmac('sha256', this.authKey);
  hmac.update(Buffer.concat([iv, encrypted]));
  const computedTag = hmac.digest();
  
  if (!crypto.timingSafeEqual(receivedTag, computedTag)) {
    throw new Error('HMAC verification failed - data tampered');
  }
  
  // Procedi con decrittografia solo se HMAC valido
  const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
```

---

#### 2. **Chiave Unica per Tutto (No Key Derivation)**
```javascript
// Attuale: stessa chiave per tutti i record
this.key = crypto.randomBytes(32); // Usata per TUTTI i dati
```

**Problema:**
- ❌ Se la chiave viene compromessa, **TUTTI** i dati sono esposti
- ❌ Nessuna separazione logica (admin, pre_admin, pr usano stessa chiave)
- ❌ Impossibile ruotare chiave senza ri-crittografare tutto il database

**Soluzione:**
```javascript
// Derivazione chiave per record
function deriveRecordKey(masterKey, recordId, tableName) {
  const kdf = crypto.createHmac('sha256', masterKey);
  kdf.update(`${tableName}:${recordId}`);
  return kdf.digest();
}

// Utilizzo
encrypt(data, recordId, tableName) {
  const recordKey = deriveRecordKey(this.masterKey, recordId, tableName);
  // Usa recordKey invece di this.key
}
```

---

#### 3. **Gestione Chiave in Development (File System)**
```javascript
const keyPath = path.join(__dirname, '../.encryption-key');
if (!fs.existsSync(keyPath)) {
  this.key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, this.key, { mode: 0o600 });
}
```

**Rischi:**
- ⚠️ File potrebbe essere accidentalmente committato in Git
- ⚠️ Backup del filesystem espongono la chiave
- ⚠️ Permessi `0o600` inefficaci su Windows
- ⚠️ Nessun logging di generazione chiave (hard to audit)

**Verifica `.gitignore`:**
```bash
# Deve contenere:
.encryption-key
```

---

#### 4. **Possibile Double Encryption Bug**

**Location:** `routes/admin.js` linee 1987-2010 (approvazione richieste PR)

```javascript
// POTENZIALE PROBLEMA:
// 1. Richiesta già contiene dati crittografati
db.get('SELECT * FROM richieste_creazione_pr WHERE id = ?', [id], (err, richiesta) => {
  // richiesta.nome = "7xQ2k...==" (JA CRITTOGRAFATO)
  
  // 2. INSERT diretto senza passare per encryptUserData
  db.run(`
    INSERT INTO pr (nome, cognome, numero_telefono, password, ...)
    VALUES (?, ?, ?, ?, ...)
  `, [richiesta.nome, richiesta.cognome, richiesta.numero_telefono, ...]);
  
  // ⚠️ Se richieste_creazione_pr salva dati in chiaro:
  //    → Dati NON vengono crittografati
  // ⚠️ Se richieste_creazione_pr salva dati crittografati:
  //    → Dati rimangono correttamente crittografati (OK)
});
```

**Investigazione necessaria:**
- Verificare schema `richieste_creazione_pr`
- Controllare come vengono salvate le richieste in `routes/pr.js`

---

### 🟡 ALTO

#### 5. **Fallback Silenzioso in Decrittografia**
```javascript
decrypt(encryptedData) {
  try {
    // ... decrittografia ...
  } catch (error) {
    // ⚠️ Ritorna dato originale se fallisce
    return encryptedData;
  }
}
```

**Problema:**
- ⚠️ Errori di decrittografia vengono nascosti
- ⚠️ Possibile esposizione di dati crittografati come plaintext in UI
- ⚠️ Difficile debugging (nessun log di errore)

**Soluzione:**
```javascript
decrypt(encryptedData) {
  try {
    // ... decrittografia ...
  } catch (error) {
    console.error('[CRYPTO] Decryption failed:', error.message);
    // Opzioni:
    // 1. Throw error (fail-hard)
    // 2. Return placeholder: "[ENCRYPTED_DATA]"
    // 3. Log + return original (attuale, ma con logging)
    throw new Error('Failed to decrypt sensitive data');
  }
}
```

---

#### 6. **Euristica `looksLikeEncryptedData()` Imperfetta**
```javascript
looksLikeEncryptedData(data) {
  // Controlla se sembra un nome normale
  if (data.length < 20 && /^[a-zA-ZàèéìòùÀÈÉÌÒÙ'\s\d-]+$/.test(data)) {
    return false; // Assume plaintext
  }
  
  // Controlla base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return base64Regex.test(data) && Buffer.from(data, 'base64').length >= 17;
}
```

**Problemi:**
- ⚠️ Nome "Marco" (5 caratteri) → considerato plaintext anche se crittografato
- ⚠️ Base64 regex permette falsi positivi (es: ID numerici)
- ⚠️ Non gestisce encoding errors

**Rischio:**
- Dati crittografati corti potrebbero essere trattati come plaintext

---

### 🟢 MEDIO

#### 7. **Nessuna Rotazione Chiave Implementata**
- ❌ Impossibile cambiare chiave senza downtime
- ❌ Nessun meccanismo di versioning chiavi
- ❌ Re-crittografia massiva richiesta in caso di compromissione

**Soluzione proposta:**
```javascript
// Versioning chiavi
const KEYS = {
  v1: Buffer.from(process.env.ENCRYPTION_KEY_V1, 'hex'),
  v2: Buffer.from(process.env.ENCRYPTION_KEY_V2, 'hex')  // Nuova chiave
};

encrypt(data, keyVersion = 'v2') {
  const key = KEYS[keyVersion];
  const iv = crypto.randomBytes(16);
  // ... crittografia ...
  // Aggiungi prefisso versione: "v2:" + base64
  return `${keyVersion}:` + combined.toString('base64');
}

decrypt(encryptedData) {
  const [version, data] = encryptedData.split(':');
  const key = KEYS[version] || KEYS.v1; // Fallback v1
  // ... decrittografia con chiave corretta ...
}
```

---

#### 8. **Password in Plaintext in Richieste Creazione PR**
```javascript
// routes/pr.js - richiesta nuovo PR
db.run(`
  INSERT INTO richieste_creazione_pr (password, ...)
  VALUES (?, ...)
`, [req.body.password]); // ⚠️ Salvata in chiaro?
```

**Verifica necessaria:**
- Controllare schema `richieste_creazione_pr`
- Se password salvata in chiaro → **VULNERABILITÀ CRITICA**
- Dovrebbe essere hashata PRIMA dell'inserimento

---

## ✅ Raccomandazioni

### Immediate (Alta Priorità)

1. **Implementare HMAC/MAC**
   - Aggiungi verifica integrità con `crypto.createHmac()`
   - Previene tampering del ciphertext
   - Standard: AES-256-CBC + HMAC-SHA256 (Encrypt-then-MAC)

2. **Verificare Double Encryption Bug**
   - Ispezionare route `/admin/approva/:id`
   - Controllare schema `richieste_creazione_pr`
   - Garantire coerenza crittografia in approvazione

3. **Logging Errori Decrittografia**
   - Sostituire `catch` silenzioso con logging
   - Usare `secure-logger` per errori crittografia
   - Alert in caso di fallimenti ripetuti

4. **Verificare Password Plaintext**
   - Controllare `richieste_creazione_pr.password`
   - Se in chiaro → hash PRIMA del salvataggio
   - Mai salvare password in plaintext

---

### Breve Termine (Media Priorità)

5. **Key Derivation per Record**
   - Implementare KDF con record ID
   - Isolare compromissione a singoli record
   - Facilita rotazione chiave graduale

6. **Migliorare Euristica Rilevamento**
   - Rimuovere logica `looksLikeEncryptedData()`
   - Aggiungere flag `encrypted` nel database
   - Schema: `nome TEXT, nome_encrypted INTEGER DEFAULT 0`

7. **Gestione Chiave Sicura in Dev**
   - Usare environment variable anche in dev
   - Documentare setup `.env` file
   - Rimuovere auto-generazione file system

---

### Lungo Termine (Bassa Priorità)

8. **Migrazione a AES-GCM**
   - Sostituire CBC con GCM (authenticated encryption)
   - Elimina necessità di HMAC separato
   - Più efficiente e sicuro

   ```javascript
   // AES-256-GCM (consigliato)
   const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
   const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
   const tag = cipher.getAuthTag(); // Built-in MAC
   ```

9. **Sistema di Rotazione Chiavi**
   - Implementare versioning chiavi
   - Script migrazione dati a nuova chiave
   - Monitoring chiavi in uso

10. **Audit Trail Crittografia**
    - Log operazioni crittografia (senza dati sensibili)
    - Tracking accessi a dati decrittografati
    - Compliance GDPR audit

---

## 📊 Riepilogo Sicurezza

| Aspetto | Stato | Valutazione |
|---------|-------|-------------|
| Algoritmo (AES-256-CBC) | ✅ | Robusto, ma CBC richiede HMAC |
| Lunghezza chiave (256 bit) | ✅ | Ottima |
| IV randomico per record | ✅ | Corretto |
| Autenticazione (HMAC) | ❌ | **ASSENTE - CRITICO** |
| Key derivation | ❌ | Chiave unica per tutto |
| Rotazione chiave | ❌ | Non implementata |
| Logging errori | ⚠️ | Catch silenzioso |
| Gestione chiave dev | ⚠️ | File system (rischio commit) |
| Gestione chiave prod | ✅ | Environment variable (corretto) |

**Score Complessivo:** 🟡 **6/10** (Funzionale ma necessita hardening)

---

## 🔍 File Chiave da Monitorare

1. **`utils/crypto.js`** → Logica core crittografia (258 linee)
2. **`models/db.js`** → Wrapper crittografia database (linee 284-447)
3. **`routes/admin.js`** → Operazioni CRUD con crittografia (linee 359, 480, 1987)
4. **`.encryption-key`** → Chiave raw (NON deve essere in Git)
5. **`.gitignore`** → Deve escludere `.encryption-key`

---

**Generato il:** 2025-12-01  
**Versione analisi:** 1.0  
**Ultima modifica codice:** routes/admin.js (soft-delete implementation)
