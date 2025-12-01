# Deploy su Railway - Guida ICONIC

## 🚀 Risoluzione Errori Database

Gli errori come `SQLITE_ERROR: no such table: pagamenti_provvigioni` o `no such column: modificata` si verificano perché Railway non ha tutte le tabelle e colonne necessarie.

## 🔧 Soluzioni

### 1. Automatica (Raccomandato)
Il database viene ora inizializzato automaticamente con TUTTE le tabelle e colonne quando l'app si avvia.

### 2. Manuale - Script di Inizializzazione Completa
Se dovessi avere ancora problemi, esegui questi comandi su Railway:

```bash
# Inizializza TUTTE le tabelle e colonne
npm run init-tables

# Testa il database prima del deploy
npm run test-db

# Oppure usa lo script specifico per Railway
npm run railway-init
```

## 🧪 Test Database Locale

Prima di fare il deploy, testa il database localmente:

```bash
npm run test-db
```

Questo script verifica:
- ✅ Tutte le tabelle esistono
- ✅ Tutte le colonne esistono  
- ✅ Tutte le query dell'app funzionano

## 📋 Tabelle Create Automaticamente

- ✅ `admin` - Amministratori
- ✅ `pre_admin` - Pre-amministratori  
- ✅ `pr` - PR staff
- ✅ `storico_tavoli` - Storico prenotazioni **CON CAMPI MODIFICA**
- ✅ `andamento_staff_mensile` - Statistiche mensili
- ✅ `richieste_tavoli` - Richieste di prenotazione **CON CAMPI MODIFICA**
- ✅ `pr_stats` - Statistiche PR
- ✅ `pagamenti_provvigioni` - Pagamenti tra PR
- ✅ `richieste_creazione_pr` - Richieste nuovi PR

## 🔧 Campi Modifica Aggiunti

### Tabelle con Tracciamento Modifiche:
- `storico_tavoli` e `richieste_tavoli` ora hanno:
  - ✅ `modificata` (INTEGER) - Flag 0/1 se modificata
  - ✅ `note_modifiche` (TEXT) - Motivazione modifiche
  - ✅ `modificato_da_nickname` (TEXT) - Chi ha modificato

## 🏗️ Struttura Database Completa

### Tabella `storico_tavoli` (AGGIORNATA)
```sql
CREATE TABLE storico_tavoli (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  numero_persone INTEGER NOT NULL,
  nome_tavolo TEXT NOT NULL,
  spesa_prevista REAL NOT NULL,
  omaggi TEXT,
  note_tavolo TEXT,
  modificata INTEGER DEFAULT 0,           -- NUOVO
  note_modifiche TEXT,                    -- NUOVO
  modificato_da_nickname TEXT,            -- NUOVO
  FOREIGN KEY(pr_id) REFERENCES pr(id)
);
```

### Tabella `richieste_tavoli` (AGGIORNATA)
```sql
CREATE TABLE richieste_tavoli (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  numero_persone INTEGER NOT NULL,
  spesa_prevista REAL NOT NULL,
  omaggi TEXT,
  nome_tavolo TEXT NOT NULL,
  note_tavolo TEXT,
  stato TEXT NOT NULL DEFAULT 'in attesa',
  modificata INTEGER DEFAULT 0,           -- NUOVO
  note_modifiche TEXT,                    -- NUOVO
  modificato_da_nickname TEXT,            -- NUOVO
  FOREIGN KEY(pr_id) REFERENCES pr(id)
);
```

### Tabella `pagamenti_provvigioni`
```sql
CREATE TABLE pagamenti_provvigioni (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_destinatario_id INTEGER NOT NULL,
  pr_pagante_id INTEGER NOT NULL,
  importo REAL NOT NULL,
  note TEXT,
  data_pagamento DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pr_destinatario_id) REFERENCES pr(id),
  FOREIGN KEY(pr_pagante_id) REFERENCES pr(id)
);
```

## 🛠️ Comandi Utili

```bash
# Avvia in produzione
npm start

# Avvia in sviluppo
npm run dev

# Test completo database
npm run test-db

# Inizializza database completo
npm run init-tables

# Inizializzazione Railway
npm run railway-init

# Pulisci database (ATTENZIONE!)
npm run clear-db
```

## 🔍 Verifica Deploy

1. Esegui `npm run test-db` localmente prima del deploy
2. Accedi alla dashboard con `admin/admin`
3. Controlla che tutte le sezioni funzionino:
   - Dashboard
   - Staff Management  
   - Report
   - Approvazioni
   - Organigramma (senza errori pagamenti_provvigioni)
4. Testa la modifica di richieste
5. Verifica il tracciamento modifiche

## 🐛 Troubleshooting

### Se vedi errori "no such table":
1. Vai nel terminale di Railway
2. Esegui: `npm run init-tables`
3. Riavvia l'applicazione

### Se vedi errori "no such column":
1. Esegui: `npm run init-tables` (include aggiunta colonne)
2. Lo script aggiungerà automaticamente le colonne mancanti

### Per test completo:
```bash
npm run test-db
```
Questo ti dirà esattamente cosa manca.

## ✅ Stato Attuale

- ✅ Database completo con tutte le tabelle
- ✅ Tutte le colonne di tracciamento modifiche
- ✅ Inizializzazione automatica completa
- ✅ Script di test per verifica pre-deploy  
- ✅ Admin default configurato  
- ✅ Responsive design completo
- ✅ Organigramma funzionale
- ✅ Sistema provvigioni operativo
- ✅ Sistema modifica prenotazioni
- ✅ Mobile friendly

La tua app ICONIC è ora completamente pronta per la produzione con tutte le funzionalità! 🎉
