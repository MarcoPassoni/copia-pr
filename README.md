# ICONIC - Gestione Staff

Dashboard Node.js/Express con EJS, HTML, CSS per la gestione staff (ICONIC).

## Funzionalità principali
- Autenticazione e permessi (Admin, Pre-Admin, PR)
- Gestione utenti e ruoli
- Dashboard e report
- Prenotazione tavoli, approvazioni, magazzino

## Struttura cartelle
- `routes/` - Routing Express
- `controllers/` - Logica applicativa
- `models/` - Modelli DB (SQLite)
- `views/` - Template EJS
- `public/` - CSS, JS statici

## Avvio progetto
1. Installa le dipendenze: `npm install`
2. Avvia il server: `npm start`

## Note
- Segui la documentazione fornita per dettagli su ruoli, permessi e flussi.
- Password e dati sensibili sono gestiti in modo sicuro (hash/criptazione).
