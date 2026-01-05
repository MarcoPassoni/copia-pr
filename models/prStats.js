const { db } = require('./db');

// Aggiorna andamento mensile e totali PR e padri ricorsivamente
function aggiornaAndamentoETotali(prId, data, numeroPersone, spesaPrevista, callback) {
  console.log('[ANDAMENTO] Inizio aggiornamento andamento per PR:', prId);
  const mese = data.slice(0, 7); // YYYY-MM
  console.log('[ANDAMENTO] Mese:', mese, 'Spesa:', spesaPrevista);
  
  const visitati = new Set(); // Traccia i PR già visitati per evitare loop
  const MAX_ITERATIONS = 100; // Limite massimo di iterazioni
  let iterationCount = 0;
  
  // Funzione iterativa per evitare stack overflow e loop
  function aggiornaIterativo(currentPrId, level = 0) {
    iterationCount++;
    console.log(`[ANDAMENTO] ${' '.repeat(level * 2)}Iterazione ${iterationCount}: Aggiorno PR ${currentPrId}`);
    
    // Protezione contro loop infiniti
    if (iterationCount > MAX_ITERATIONS) {
      console.error('[ANDAMENTO] ⚠️ LIMITE ITERAZIONI RAGGIUNTO - possibile loop infinito!');
      return callback && callback(null); // Esce con successo parziale
    }
    
    // Se ho già visitato questo PR, è un ciclo
    if (visitati.has(currentPrId)) {
      console.warn(`[ANDAMENTO] ${' '.repeat(level * 2)}⚠️ CICLO RILEVATO! PR ${currentPrId} già visitato, interruzione`);
      return callback && callback(null);
    }
    visitati.add(currentPrId);
    
    db.run(`INSERT INTO andamento_staff_mensile (pr_id, mese, totale_mese)
            VALUES (?, ?, ?)
            ON CONFLICT(pr_id, mese) DO UPDATE SET totale_mese = totale_mese + ?`,
      [currentPrId, mese, spesaPrevista, spesaPrevista], function (err1) {
        if (err1) {
          console.error('[ANDAMENTO] Errore insert/update andamento_staff_mensile:', err1);
          return callback && callback(err1);
        }
        console.log(`[ANDAMENTO] ${' '.repeat(level * 2)}andamento_staff_mensile aggiornato`);
        
        db.run(`UPDATE pr SET tot_spesa_tavolo = tot_spesa_tavolo + ?, tot_persone_portate = tot_persone_portate + ? WHERE id = ?`,
          [spesaPrevista, numeroPersone, currentPrId], function (err2) {
            if (err2) {
              console.error('[ANDAMENTO] Errore update totali PR:', err2);
              return callback && callback(err2);
            }
            console.log(`[ANDAMENTO] ${' '.repeat(level * 2)}Totali PR aggiornati`);
            
            console.log(`[ANDAMENTO] ${' '.repeat(level * 2)}Cerco padre per PR ${currentPrId}...`);
            db.get(`SELECT fk_padre FROM pr WHERE id = ?`, [currentPrId], (err3, row) => {
              if (err3) {
                console.error('[ANDAMENTO] Errore select fk_padre:', err3);
                return callback && callback(err3);
              }
              
              if (!row) {
                console.log(`[ANDAMENTO] ${' '.repeat(level * 2)}PR non trovato`);
                return callback && callback(null);
              }
              
              console.log(`[ANDAMENTO] ${' '.repeat(level * 2)}fk_padre: ${row.fk_padre}`);
              
              if (!row.fk_padre) {
                console.log(`[ANDAMENTO] ${' '.repeat(level * 2)}Nessun padre - Fine catena`);
                return callback && callback(null);
              }
              
              if (row.fk_padre === currentPrId) {
                console.error(`[ANDAMENTO] ${' '.repeat(level * 2)}⚠️ ERRORE: PR ${currentPrId} è padre di se stesso!`);
                return callback && callback(null);
              }
              
              console.log(`[ANDAMENTO] ${' '.repeat(level * 2)}Proseguo con padre ${row.fk_padre}`);
              aggiornaIterativo(row.fk_padre, level + 1);
            });
          });
      });
  }
  
  console.log('[ANDAMENTO] Inizializzo aggiornamento iterativo');
  aggiornaIterativo(prId);
}

// Leggi andamento mensile di un PR
function getAndamentoMensile(prId, callback) {
  db.all(`SELECT mese, totale_mese FROM andamento_staff_mensile WHERE pr_id = ? ORDER BY mese`, [prId], callback);
}

// Aggiorna o crea statistiche mensili per un PR
function aggiornaStatsMensili(prId, anno, mese, persone, tavoli, provvigioni, callback) {
  db.run(`INSERT INTO pr_stats (pr_id, anno, mese, totale_persone, totale_tavoli, totale_provvigioni)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(pr_id, anno, mese) DO UPDATE SET 
            totale_persone = totale_persone + ?,
            totale_tavoli = totale_tavoli + ?,
            totale_provvigioni = totale_provvigioni + ?`,
    [prId, anno, mese, persone, tavoli, provvigioni, persone, tavoli, provvigioni],
    callback
  );
}

// Ottieni statistiche mensili di un PR
function getStatsMensili(prId, callback) {
  db.all(`SELECT anno, mese, totale_persone, totale_tavoli, totale_provvigioni 
          FROM pr_stats 
          WHERE pr_id = ? 
          ORDER BY anno DESC, mese DESC`, [prId], callback);
}

module.exports = {
  aggiornaAndamentoETotali,
  getAndamentoMensile,
  aggiornaStatsMensili,
  getStatsMensili
};
