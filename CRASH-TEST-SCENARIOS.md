# CRASH TEST SCENARIOS - ICONIC Dashboard
**Data generazione:** 2025-12-01  
**Scopo:** Scenari di test per identificare potenziali crash dell'applicazione

---

## 🔴 SCENARI CRITICI - Alta probabilità di crash

### 1. **NULL/UNDEFINED Database Responses**
**Rischio:** Crash immediato per accesso a proprietà di oggetti null/undefined

#### Test Case 1.1: Login con utente inesistente + DB lento
```bash
# Scenario: DB risponde lentamente, callback eseguito su oggetto undefined
Passi:
1. Configura timeout DB molto basso
2. Tenta login con credenziali inesistenti
3. Attendi risposta asincrona
Crash previsto: Cannot read property 'password' of undefined (auth.js:45-65)
```

#### Test Case 1.2: Accesso pagina staff senza gerarchia
```bash
# File: routes/admin.js:199-240
Scenario: Admin senza PR subordinati
Passi:
1. Crea admin nuovo senza PR assegnati
2. Naviga a /admin/staff
3. Verifica query union vuota
Crash previsto: Cannot read property 'map' of undefined (admin.js:234)
```

#### Test Case 1.3: Dashboard PR senza dati statistiche
```bash
# File: routes/pr.js:447-540
Scenario: PR appena creato senza storico
Passi:
1. Crea nuovo PR
2. Accedi a /pr/dashboard
3. Query stats ritorna null
Crash previsto: TypeError su statsPersonali.prenotazioni_personali (pr.js:489)
```

---

### 2. **Integer Overflow / Parsing Errors**
**Rischio:** Crash per parseInt/parseFloat su valori non numerici

#### Test Case 2.1: ID utente con caratteri speciali
```bash
# File: routes/admin.js:408, 486, 1556, 1702, 1793
Payload: POST /admin/staff/delete
Body: { id: "999999999999999999999999999999", ruolo: "pr" }
Crash previsto: parseInt overflow → NaN → query fallita
```

#### Test Case 2.2: Importo pagamento con scientific notation
```bash
# File: routes/pr.js:880, routes/admin.js:2212, 2301
Payload: POST /paga-provvigioni
Body: { importo: "1e308", figlio_id: 1 }
Crash previsto: parseFloat(Infinity) → UPDATE corrompe DB
```

#### Test Case 2.3: Percentuale provvigione negativa estrema
```bash
# File: routes/pr.js:1011
Payload: POST /richiesta-nuovo-pr
Body: { percentuale_provvigione: "-999999999999" }
Crash previsto: Validazione bypass → calcolo provvigioni negativo → errore aritmetico
```

---

### 3. **Array/Map Operations su Null**
**Rischio:** Crash per operazioni su collezioni undefined

#### Test Case 3.1: Gerarchia PR circolare
```bash
# File: utils/admin-data-filter.js:31-47
Scenario: PR con fk_padre che punta a se stesso
Setup:
  UPDATE pr SET fk_padre = id WHERE id = 5;
Operazione: Carica /admin/staff
Crash previsto: Stack overflow per ricorsione infinita (admin-data-filter.js:35-40)
```

#### Test Case 3.2: Processamento admin senza hierarchy data
```bash
# File: routes/admin.js:113-116
Scenario: Promise.all su array vuoto
Passi:
1. Elimina tutti i PR dal DB
2. Admin carica overview
3. adminsDecrypted.map() su array vuoto
Crash previsto: validResults.forEach crash se Promise reject non gestito (admin.js:118)
```

#### Test Case 3.3: Filter su oggetto non array
```bash
# File: utils/admin-data-filter.js:296-317
Scenario: allData.pr non è array
Passi:
1. Simula risposta DB malformata
2. filterDatabaseDataForAdmin riceve object invece di array
Crash previsto: TypeError: allData.pr.filter is not a function
```

---

### 4. **Recursive Query Explosions**
**Rischio:** Crash per memoria esaurita o timeout query

#### Test Case 4.1: Gerarchia PR profonda >10 livelli
```bash
# File: routes/pr.js:68-84 (getFigliQuery)
Scenario: Creare catena di PR padre→figlio→nipote... 15 livelli
Setup:
  INSERT pr con fk_padre in cascata fino a livello 15
Operazione: PR root carica dashboard
Crash previsto: Query timeout o memoria esaurita (hard cap 10 livelli ma loop possibile)
```

#### Test Case 4.2: CTE ricorsiva senza WHERE attivo=1 (pre-patch)
```bash
# File: routes/pr.js:607-710 (organigramma sotto_staff_tree)
Scenario: PR disattivati inclusi in recursione
Passi:
1. Crea gerarchia 8 livelli
2. Disattiva PR a livello 3 (soft delete)
3. PR livello 1 carica organigramma
Crash previsto: Riferimenti a padre disattivato → infinite loop su fk_padre null
```

#### Test Case 4.3: Calcolo provvigioni gerarchiche circolari
```bash
# File: routes/admin.js:857-975 (calculateHierarchicalCommissions)
Scenario: Due PR con fk_padre reciproci
Setup:
  UPDATE pr SET fk_padre = 6 WHERE id = 5;
  UPDATE pr SET fk_padre = 5 WHERE id = 6;
Operazione: Admin carica report
Crash previsto: Stack overflow in calculateHierarchicalCommissions (admin.js:867-875)
```

---

### 5. **JSON Parsing/Serialization Crashes**
**Rischio:** Crash per JSON.parse su dati non validi o circular refs

#### Test Case 5.1: Body malformato con caratteri unicode invalidi
```bash
# File: server.js:57-58 (express.json, bodyParser.urlencoded)
Payload: POST /admin/staff/create
Headers: Content-Type: application/json
Body (raw): { "nome": "\uD800" }  # Surrogate singolo non valido
Crash previsto: SyntaxError: Unexpected token in JSON
```

#### Test Case 5.2: Circular reference in session user object
```bash
# File: routes/auth.js:67-73
Scenario: Session object con riferimento circolare
Passi:
1. Modifica manualmente session storage
2. Inserisci req.session.user.user = req.session.user
3. Tenta serializzazione sessione
Crash previsto: TypeError: Converting circular structure to JSON
```

---

### 6. **Database Transaction Failures**
**Rischio:** Crash per transazioni incomplete o rollback mancati

#### Test Case 6.1: Approvazione tavolo con interruzione mid-transaction
```bash
# File: routes/admin.js:2109-2157
Scenario: Server crash durante transazione BEGIN-COMMIT
Passi:
1. POST /admin/tavolo/:id/approva
2. Uccidi processo Node.js dopo INSERT storico_tavoli ma prima di UPDATE pr
Verifica:
  - Tavolo in storico senza provvigioni aggiornate
  - Stato richiesta_tavoli inconsistente
Crash previsto: DB lock / constraint violation al prossimo avvio
```

#### Test Case 6.2: Doppio approvazione richiesta PR concorrente
```bash
# File: routes/admin.js:1991-2030
Scenario: Due admin approvano stessa richiesta_creazione_pr simultaneamente
Passi:
1. Due sessioni admin diverse
2. Entrambi POST /admin/richieste-pr/:id/approva nello stesso ms
3. Race condition su INSERT pr + UPDATE richieste_creazione_pr
Crash previsto: UNIQUE constraint failed: pr.nickname (admin.js:1999)
```

---

### 7. **Memory Leaks / Resource Exhaustion**
**Rischio:** Crash per OOM (Out Of Memory)

#### Test Case 7.1: Query massiva su storico_tavoli
```bash
# File: routes/admin.js:1146, 1493
Scenario: DB con 1.000.000+ righe storico_tavoli
Operazione: GET /admin/database (carica tutte tabelle)
Crash previsto: Heap out of memory fetching all rows (admin.js:1493)
```

#### Test Case 7.2: Session flooding
```bash
# File: server.js:78-86 (session config con MemoryStore)
Scenario: 100.000 sessioni aperte simultanee
Tool: Apache Bench o custom script
  ab -n 100000 -c 1000 http://localhost:3000/login
Crash previsto: MemoryStore esaurisce RAM → process killed by OS
```

#### Test Case 7.3: Recursive getComprehensiveStats con gerarchia larghissima
```bash
# File: routes/pr.js:64-186
Scenario: PR con 5000 figli diretti (livello 1)
Setup: INSERT 5000 PR con stesso fk_padre
Operazione: Root PR carica dashboard
Crash previsto: Array troppo grande → heap overflow (pr.js:85 allIds array)
```

---

### 8. **Type Coercion Edge Cases**
**Rischio:** Crash per comparazioni o operazioni matematiche inconsistenti

#### Test Case 8.1: ID confronto stringa vs numero
```bash
# File: routes/admin.js:411 (userId === 1)
Payload: POST /admin/staff/delete
Body: { id: "1", ruolo: "admin" }
Nota: parseInt("1") === 1 funziona, MA parseInt("01") === 1 bypass protezione
Test: { id: "01", ruolo: "admin" } potrebbe eliminare admin principale
```

#### Test Case 8.2: Boolean coercion in req.body.poteri
```bash
# File: routes/admin.js:499-502
Payload vari:
  - { poteri: ["0", "1"] } → poteri = 1
  - { poteri: [] } → array vuoto → undefined
  - { poteri: "true" } → poteri = 0 (string "true" !== "1")
Crash previsto: Assegnazione poteri inconsistente → PR senza permessi accede route protette
```

#### Test Case 8.3: Date parsing con fusi orari ambigui
```bash
# File: routes/pr.js:586 (validazione data richiesta tavolo)
Payload: POST /pr/prenotazioni
Body: { data: "2024-02-30", ... }  # Data invalida
Verifica: Date.parse("2024-02-30") → NaN, ma !isNaN(NaN) → true passa validazione
Crash previsto: INSERT con data NULL → constraint violation
```

---

## 🟡 SCENARI MODERATI - Media probabilità

### 9. **File System Operations**
**Rischio:** Crash per file assenti o permessi negati

#### Test Case 9.1: Favicon mancante in produzione
```bash
# File: server.js:91-94
Scenario: Deployment senza file favicon.ico
Verifica: fs.existsSync gestito, MA serve-favicon può lanciare eccezione interna
Test: Rimuovi public/img/favicon.ico e riavvia
Crash potenziale: Unhandled exception in favicon middleware
```

#### Test Case 9.2: Encryption key file corrotto
```bash
# File: utils/crypto.js:6-15
Scenario: .encryption-key con contenuto non base64
Setup:
  echo "!!!INVALID_BASE64!!!" > .encryption-key
Operazione: Qualsiasi login o CRUD utente
Crash previsto: Buffer.from(key, 'base64') genera chiave errata → decrypt fallisce silenziosamente
Effetto: Dati non decifrabili → confronto password sempre fallisce
```

---

### 10. **Middleware Chain Interruptions**
**Rischio:** Crash per middleware che non chiama next() o risponde

#### Test Case 10.1: isAdmin middleware con sessione scaduta
```bash
# File: routes/admin.js:15-21
Scenario: Cookie sessione valido ma session store cleared
Passi:
1. Login come admin
2. Riavvia server (MemoryStore pulito)
3. Riusa vecchio cookie
Crash previsto: req.session.user undefined → redirect loop o 500
```

#### Test Case 10.2: ensurePR con ruolo cambiato a runtime
```bash
# File: routes/pr.js:6-11
Scenario: PR degradato ad altro ruolo mentre sessione attiva
Setup:
  UPDATE pr SET ruolo = 'pre_admin' WHERE id = session.user.id
  (Simulazione manuale DB)
Operazione: PR naviga su route protetta
Crash previsto: Ruolo in DB ≠ ruolo in sessione → accesso negato inaspettato
```

---

### 11. **Concurrency & Race Conditions**

#### Test Case 11.1: Double-submit form creazione utente
```bash
# File: routes/admin.js:321-390
Scenario: Click doppio rapido su "Crea Utente"
Strumento: Script che invia due POST identiche in <10ms
Crash previsto: UNIQUE constraint su nickname → seconda richiesta fallisce
Mitigazione attuale: Validazione nicknameExists, ma race window esiste
```

#### Test Case 11.2: Pagamento provvigioni simultaneo da padre e admin
```bash
# File: routes/pr.js:849-920, routes/admin.js:2188-2244
Scenario: Admin e PR padre pagano stesso PR nello stesso istante
Verifica: Due UPDATE pr.provvigioni_totali_pagate concorrenti
Crash previsto: Lost update → saldo provvigioni errato
```

---

## 🟢 SCENARI MINORI - Bassa probabilità

### 12. **Environment Variable Misconfigurations**

#### Test Case 12.1: NODE_ENV non impostato in produzione
```bash
# File: routes/debug.js:12-16
Scenario: Deployment senza NODE_ENV=production
Verifica: Route /debug/query accessibile
Test: curl http://prod-server/debug/query?sql=DROP%20TABLE%20pr
Crash previsto: Database distrutto → tutte route falliscono
```

#### Test Case 12.2: SESSION_SECRET vuoto
```bash
# File: server.js:78
Scenario: .env senza SESSION_SECRET
Effetto: Usa default 'iconic-secret-2024' → session hijacking
Test: Non crash immediato, ma sicurezza compromessa
```

---

## 🧪 STRESS TEST SUITES

### Suite A: Boundary Value Testing
```javascript
// Test limiti numerici
const boundaryTests = {
  maxInt: 2147483647,      // Limite INTEGER SQLite
  minInt: -2147483648,
  maxFloat: 1.7976931348623157e+308,  // JavaScript Number.MAX_VALUE
  precision: 0.0000000001,  // Floating point precision loss
  
  // Test lunghezze stringhe
  maxNickname: "a".repeat(255),
  maxNote: "x".repeat(10000),
  unicodeEdge: "\u0000\uFFFF",  // NULL char e massimo unicode
};
```

### Suite B: Load Testing
```bash
# Apache Bench scenarios
# Test 1: Login brute force
ab -n 10000 -c 100 -p login.json -T application/json http://localhost:3000/login

# Test 2: Dashboard concurrent access
ab -n 5000 -c 50 -C "connect.sid=VALID_SESSION" http://localhost:3000/admin/staff

# Test 3: Database write storm
ab -n 1000 -c 20 -p tavolo.json http://localhost:3000/pr/prenotazioni
```

### Suite C: Fuzz Testing
```javascript
// Payload fuzzing per input fields
const fuzzPayloads = [
  null, undefined, "", " ", "null", "undefined",
  0, -1, Infinity, NaN, "NaN",
  [], {}, [[]], [{}],
  true, false, "true", "false",
  "<script>alert(1)</script>",
  "'; DROP TABLE pr; --",
  "../../../etc/passwd",
  "\x00\x01\x02\x03",  // Control chars
  "🚀💣🔥",            // Emoji
  "A".repeat(1000000),  // Mega string
];
```

---

## 📋 TEST EXECUTION CHECKLIST

### Pre-Test Setup
- [ ] Backup database completo
- [ ] Configurare logging dettagliato
- [ ] Disabilitare rate limiting (se presente)
- [ ] Isolare ambiente di test da produzione
- [ ] Installare monitoring tool (PM2, New Relic, etc.)

### Durante Esecuzione
- [ ] Monitorare uso memoria (node --inspect)
- [ ] Tracciare query DB (PRAGMA query_only ON per safety)
- [ ] Catturare stack trace completi
- [ ] Registrare payload esatti che causano crash
- [ ] Verificare stato DB post-crash

### Post-Test Analysis
- [ ] Classificare crash per severità (Critical/High/Medium/Low)
- [ ] Identificare pattern comuni
- [ ] Verificare rollback transazioni
- [ ] Controllare data corruption
- [ ] Documentare fix necessari

---

## 🛠️ STRUMENTI CONSIGLIATI

### 1. **Debugging**
```bash
# Node.js inspector
node --inspect-brk server.js

# Memory profiling
node --max-old-space-size=512 --expose-gc server.js

# CPU profiling
node --prof server.js
```

### 2. **Database Testing**
```bash
# SQLite stress test
sqlite3 iconic.db "PRAGMA integrity_check;"
sqlite3 iconic.db "PRAGMA foreign_key_check;"

# Query performance
sqlite3 iconic.db "EXPLAIN QUERY PLAN SELECT ..."
```

### 3. **HTTP Load Testing**
```bash
# Apache Bench (installato)
# Artillery (npm install -g artillery)
artillery quick --count 1000 --num 50 http://localhost:3000/login

# Vegeta (Go tool)
echo "GET http://localhost:3000/admin/staff" | vegeta attack -duration=30s -rate=50
```

### 4. **Automated Testing**
```javascript
// Jest/Mocha test framework
describe('Crash Scenarios', () => {
  it('should handle null DB response', async () => {
    // Mock DB to return null
    // Assert no crash, error handled gracefully
  });
  
  it('should prevent integer overflow', () => {
    const result = parseInt("999999999999999999");
    expect(Number.isSafeInteger(result)).toBe(false);
  });
});
```

---

## 🚨 CRASH RECOVERY PROCEDURES

### Se il server crasha durante test:

1. **Immediate Actions**
   ```bash
   # Stop server
   pkill -f "node server.js"
   
   # Check DB integrity
   sqlite3 iconic.db "PRAGMA integrity_check;"
   
   # Restore from backup se necessario
   cp iconic.db.backup iconic.db
   ```

2. **Log Analysis**
   ```bash
   # Trova ultimo errore
   tail -n 100 server.log | grep -i error
   
   # Stack trace completo
   cat crash-dump.log
   ```

3. **Incident Report**
   - Timestamp crash
   - Payload/request esatto
   - Stack trace
   - Stato DB prima/dopo
   - Passi per riprodurre

---

## 📊 METRICHE DI SUCCESSO

### Definizione "Crash"
- ✅ **Process exit code ≠ 0**
- ✅ **Unhandled exception → server stop**
- ✅ **Out of memory kill**
- ✅ **Database locked indefinitely**
- ✅ **Response timeout >30s senza risposta**

### Obiettivo Testing
- **100% coverage** scenari critici (1-8)
- **>80% coverage** scenari moderati (9-11)
- **0 crash non gestiti** in produzione
- **<5s recovery time** per crash gestiti (graceful shutdown)

---

## 🔗 RIFERIMENTI CODICE

### File più a rischio (ordinati per criticità):
1. `routes/pr.js` - 1138 righe, query ricorsive complesse
2. `routes/admin.js` - 2458 righe, transazioni multiple
3. `utils/admin-data-filter.js` - Ricorsione gerarchia
4. `models/db.js` - Gestione encryption + migrazioni
5. `routes/debug.js` - Esecuzione SQL arbitraria

### Pattern pericolosi identificati:
- **35+ db.all/get/run** senza proper error handling
- **12+ parseInt/parseFloat** senza validazione pre-conversione
- **8+ Promise chains** potenzialmente non-catchate
- **5+ recursive functions** senza depth guard
- **3+ BEGIN TRANSACTION** senza rollback garantito

---

**NOTA FINALE:** Questo documento è vivo. Aggiorna con nuovi scenari scoperti durante testing reale.

**Priorità esecuzione:** Inizia da Scenari Critici 1-4, poi Stress Suite B, infine copertura completa.
