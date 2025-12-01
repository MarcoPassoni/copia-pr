const { db } = require('./db');

// Aggiorna andamento mensile e totali PR e padri ricorsivamente
function aggiornaAndamentoETotali(prId, data, numeroPersone, spesaPrevista, callback) {
  const mese = data.slice(0, 7); // YYYY-MM
  // Funzione iterativa per evitare stack overflow e loop
  function aggiornaIterativo(currentPrId) {
    // [PRODUCTION] Removed console.log('[DEBUG] [Andamento] Aggiorno andamento per PR:', currentPrId)
    db.run(`INSERT INTO andamento_staff_mensile (pr_id, mese, totale_mese)
            VALUES (?, ?, ?)
            ON CONFLICT(pr_id, mese) DO UPDATE SET totale_mese = totale_mese + ?`,
      [currentPrId, mese, spesaPrevista, spesaPrevista], function (err1) {
        if (err1) {
          console.error('[DEBUG] [Andamento] Errore insert/update andamento_staff_mensile:', err1);
          return callback && callback(err1);
        }
        // [PRODUCTION] Removed console.log('[DEBUG] [Andamento] andamento_staff_mensile aggiornato per PR:', currentPrId)
        db.run(`UPDATE pr SET tot_spesa_tavolo = tot_spesa_tavolo + ?, tot_persone_portate = tot_persone_portate + ? WHERE id = ?`,
          [spesaPrevista, numeroPersone, currentPrId], function (err2) {
            if (err2) {
              console.error('[DEBUG] [Andamento] Errore update totali PR:', err2);
              return callback && callback(err2);
            }
            // [PRODUCTION] Removed console.log('[DEBUG] [Andamento] Totali PR aggiornati per PR:', currentPrId)
            db.get(`SELECT fk_padre FROM pr WHERE id = ?`, [currentPrId], (err3, row) => {
              if (err3) {
                console.error('[DEBUG] [Andamento] Errore select fk_padre:', err3);
                return callback && callback(err3);
              }
              if (!row || !row.fk_padre) {
                // [PRODUCTION] Removed console.log('[DEBUG] [Andamento] Nessun padre, fine catena per PR:', currentPrId)
                return callback && callback(null);
              }
              if (row.fk_padre === currentPrId) {
                console.error('[DEBUG] [Andamento] ATTENZIONE: fk_padre coincide con PR corrente (ciclo rilevato), interruzione ricorsione per PR:', currentPrId);
                return callback && callback(null);
              }
              db.get(`SELECT id FROM pr WHERE id = ?`, [row.fk_padre], (err4, padreRow) => {
                if (err4) {
                  console.error('[DEBUG] [Andamento] Errore select padreRow:', err4);
                  return callback && callback(err4);
                }
                if (!padreRow) {
                  // [PRODUCTION] Removed console.log('[DEBUG] [Andamento] Padre non è un PR, fine catena per PR:', currentPrId)
                  return callback && callback(null);
                }
                // [PRODUCTION] Removed console.log('[DEBUG] [Andamento] Proseguo aggiornamento per padre PR:', row.fk_padre)
                aggiornaIterativo(row.fk_padre);
              });
            });
          });
      });
  }
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
