# NUOVA FUNZIONALITÀ: MODIFICA PRENOTAZIONI TAVOLI

## 📝 DESCRIZIONE
L'admin può ora modificare le prenotazioni tavoli prima di approvarle, permettendo di correggere:
- Numero di persone
- Nome del tavolo
- Spesa prevista
- Data
- Omaggi
- Note del tavolo

## 🔧 FUNZIONALITÀ IMPLEMENTATE

### 1. Modifica Prenotazioni
- **Pulsante "Modifica"** in ogni richiesta nella pagina Approvazioni
- **Modal di modifica** con tutti i campi editabili
- **Campo obbligatorio** per le note delle modifiche (motivazione)
- **Tracciamento automatico** delle modifiche (flag modificata = 1)

### 2. Visualizzazione Modifiche
- **Righe evidenziate** per le richieste modificate (sfondo giallo)
- **Badge "Modificato"** per distinguere le richieste modificate
- **Note delle modifiche** visibili nelle richieste e nello storico
- **Indicatore visivo** anche nei tavoli approvati

### 3. Calcoli Aggiornati
- **Provvigioni calcolate** sui dati modificati dall'admin
- **Andamento e statistiche** basati sui valori finali modificati
- **Storico completo** con tracciamento delle modifiche

## 📊 CAMPI MODIFICABILI

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| Data | Date | Data della prenotazione |
| Numero Persone | Number | Numero di ospiti |
| Spesa Prevista | Number | Importo in euro |
| Nome Tavolo | Text | Nome/codice del tavolo |
| Omaggi | Text | Lista omaggi (separati da virgola) |
| Note Tavolo | Textarea | Note generali |
| Note Modifiche | Textarea | **OBBLIGATORIO** - Motivo delle modifiche |

## 🗃️ MODIFICHE DATABASE

### Nuove Colonne - `richieste_tavoli`
```sql
ALTER TABLE richieste_tavoli ADD COLUMN modificata INTEGER DEFAULT 0;
ALTER TABLE richieste_tavoli ADD COLUMN note_modifiche TEXT;
ALTER TABLE richieste_tavoli ADD COLUMN modificato_da_nickname TEXT;
```

### Nuove Colonne - `storico_tavoli`
```sql
ALTER TABLE storico_tavoli ADD COLUMN modificata INTEGER DEFAULT 0;
ALTER TABLE storico_tavoli ADD COLUMN note_modifiche TEXT;
ALTER TABLE storico_tavoli ADD COLUMN modificato_da_nickname TEXT;
```

### Schema Completo Tracciamento
| Campo | Tipo | Descrizione |
|-------|------|-------------|
| modificata | INTEGER | Flag 0/1 se è stata modificata |
| note_modifiche | TEXT | Descrizione delle modifiche apportate |
| modificato_da_nickname | TEXT | Nickname dell'admin/pre-admin che ha modificato |

## 🌐 NUOVE ROUTE

### POST `/admin/approvazioni/modifica`
- **Scopo**: Modifica una richiesta tavolo esistente
- **Parametri**: id, data, numero_persone, spesa_prevista, nome_tavolo, omaggi, note_tavolo, note_modifiche
- **Validazione**: Controlla campi obbligatori
- **Azione**: Aggiorna la richiesta e imposta modificata = 1

## 🎨 MIGLIORAMENTI UI

### Pagina Approvazioni
- ✅ Pulsante "Modifica" per ogni richiesta
- ✅ Modal responsive per la modifica
- ✅ Evidenziazione visiva delle richieste modificate
- ✅ Badge di stato (In attesa / Modificato)

### Pagina Tavoli Approvati
- ✅ Colonna "Stato" con badge (Approvato / Modificato)
- ✅ Note delle modifiche visibili nello storico
- ✅ Righe evidenziate per tavoli modificati

## 🔄 FLUSSO OPERATIVO

1. **PR invia richiesta** → Stato: "In attesa"
2. **Admin visualizza** → Può scegliere: Modifica, Approva, Rifiuta
3. **Se modifica** → Compila form con correzioni + motivo
4. **Sistema salva** → Stato: "Modificato", flag modificata = 1
5. **Admin approva** → Dati modificati vanno in storico
6. **Calcoli finali** → Basati sui valori modificati dall'admin

## ⚡ VANTAGGI

- **Flessibilità**: Admin può correggere errori senza rifiutare
- **Tracciabilità**: Ogni modifica è documentata e visibile
- **Precisione**: Calcoli basati sui dati finali corretti
- **Workflow migliorato**: Meno rifiuti, più correzioni collaborative
- **Storico completo**: Visibilità delle modifiche anche dopo l'approvazione

## 🔐 SICUREZZA
- **Solo Admin**: Funzionalità riservata agli amministratori
- **Audit Trail**: Tutte le modifiche sono tracciate
- **Validazione**: Controlli su tutti i campi obbligatori
- **Motivazione obbligatoria**: Admin deve giustificare le modifiche

---

**Data Implementazione**: 5 Agosto 2025  
**Stato**: ✅ IMPLEMENTATO E TESTATO  
**Versione**: ICONIC v2.1 - Admin Modify Enhancement
