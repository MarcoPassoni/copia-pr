const { db } = require('./db');
const { aggiornaAndamentoETotali, aggiornaStatsMensili } = require('./prStats');

// Approva una richiesta tavolo: sposta su storico, aggiorna andamento, elimina richiesta
function approvaRichiestaTavolo(richiestaId, callback) {
  console.log('[APPROVA RICHIESTA] Inizio approvazione tavolo ID:', richiestaId);
  
  // Timeout di sicurezza - se non finisce in 30 secondi, forza l'errore
  let timeoutHandle = setTimeout(() => {
    console.error('[APPROVA RICHIESTA] TIMEOUT - La richiesta ha impiegato troppo tempo');
    timeoutHandle = null;
    if (callback) {
      callback(new Error('Timeout approvazione richiesta'));
    }
  }, 30000);
  
  const executeCallback = (err) => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    if (callback) {
      callback(err);
    }
  };
  
  db.get('SELECT * FROM richieste_tavoli WHERE id = ?', [richiestaId], (err, richiesta) => {
    if (err) {
      console.error('[APPROVA RICHIESTA] Errore select richiesta:', err);
      return executeCallback(err);
    }
    if (!richiesta) {
      console.error('[APPROVA RICHIESTA] Nessuna richiesta trovata con ID:', richiestaId);
      return executeCallback(new Error('Richiesta non trovata'));
    }
    console.log('[APPROVA RICHIESTA] Richiesta trovata, inserisco in storico...');
    db.run(`INSERT INTO storico_tavoli (pr_id, data, numero_persone, nome_tavolo, spesa_prevista, omaggi, note_tavolo, modificata, note_modifiche, modificato_da_nickname)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [richiesta.pr_id, richiesta.data, richiesta.numero_persone, richiesta.nome_tavolo, richiesta.spesa_prevista, richiesta.omaggi || '', richiesta.note_tavolo, richiesta.modificata || 0, richiesta.note_modifiche || '', richiesta.modificato_da_nickname || ''],
      function(err2) {
        if (err2) {
          console.error('[APPROVA RICHIESTA] Errore insert storico_tavoli:', err2);
          return executeCallback(err2);
        }
        console.log('[APPROVA RICHIESTA] Inserito in storico, aggiorno stats mensili...');
        
        // Calcolo per statistiche mensili
        const dataObj = new Date(richiesta.data);
        const anno = dataObj.getFullYear();
        const mese = dataObj.getMonth() + 1; // getMonth() ritorna 0-11, aggiungiamo 1
        
        // Aggiorna statistiche mensili del PR
        const percentualeProvvigione = 10; // Default, dovrebbe essere preso dal DB
        const provvigioniCalcolate = (richiesta.spesa_prevista * percentualeProvvigione) / 100;
        
        aggiornaStatsMensili(richiesta.pr_id, anno, mese, richiesta.numero_persone, 1, provvigioniCalcolate, (errStats) => {
          if (errStats) {
            console.error('[APPROVA RICHIESTA] Errore aggiornamento statistiche mensili:', errStats);
            // Non blocchiamo il flusso per questo errore
          } else {
            console.log('[APPROVA RICHIESTA] Stats mensili aggiornate');
          }
          
          // Continua con aggiornamento provvigioni e totali del PR
          console.log('[APPROVA RICHIESTA] Aggiorno provvigioni e totali PR...');
          aggiornaProvvigioniETotaliPR(richiesta.pr_id, richiesta.numero_persone, richiesta.spesa_prevista, (err3) => {
            if (err3) {
              console.error('[APPROVA RICHIESTA] Errore aggiornaProvvigioniETotaliPR:', err3);
              return executeCallback(err3);
            }
            console.log('[APPROVA RICHIESTA] Provvigioni aggiornate, aggiorno andamento...');
            aggiornaAndamentoETotali(richiesta.pr_id, richiesta.data, richiesta.numero_persone, richiesta.spesa_prevista, (err4) => {
              if (err4) {
                console.error('[APPROVA RICHIESTA] Errore aggiornaAndamentoETotali:', err4);
                return executeCallback(err4);
              }
              console.log('[APPROVA RICHIESTA] Andamento aggiornato, elimino richiesta tavolo...');
              db.run('DELETE FROM richieste_tavoli WHERE id = ?', [richiestaId], function(err5) {
                if (err5) {
                  console.error('[APPROVA RICHIESTA] Errore delete richiesta_tavoli:', err5);
                  return executeCallback(err5);
                }
                console.log('[APPROVA RICHIESTA] ✅ Richiesta tavolo approvata e rimossa con successo');
                executeCallback(null);
              });
            });
          });
        });
      });
  });
}

// Rifiuta una richiesta tavolo: elimina richiesta
function rifiutaRichiestaTavolo(richiestaId, callback) {
  db.run('DELETE FROM richieste_tavoli WHERE id = ?', [richiestaId], callback);
}

// Aggiorna provvigioni del PR e dei suoi padri ricorsivamente
function aggiornaProvvigioniETotaliPR(prId, numeroPersone, spesaPrevista, callback) {
  // [PRODUCTION] Removed console.log('[DEBUG] [Provvigioni] Inizio aggiornamento provvigioni per PR:', prId)
  
  // Array per tracciare i PR già processati e prevenire loop infiniti
  const prProcessati = new Set();
  
  // Funzione ricorsiva per aggiornare provvigioni di PR e padri
  function aggiornaProvvigioniRicorsivo(currentPrId) {
    // Controllo per prevenire loop infiniti
    if (prProcessati.has(currentPrId)) {
      // [PRODUCTION] Removed console.log('[DEBUG] [Provvigioni] LOOP PREVENUTO: PR', currentPrId, 'già processato, interrompo propagazione')
      callback && callback(null);
      return;
    }
    
    // Aggiungo il PR corrente alla lista dei processati
    prProcessati.add(currentPrId);
    // Prima recupero la percentuale di provvigione del PR corrente
    db.get('SELECT percentuale_provvigione, fk_padre FROM pr WHERE id = ?', [currentPrId], (err, pr) => {
      if (err) {
        console.error('[DEBUG] [Provvigioni] Errore recupero dati PR:', err);
        return callback && callback(err);
      }
      
      if (!pr) {
        console.error('[DEBUG] [Provvigioni] PR non trovato con ID:', currentPrId);
        return callback && callback(new Error('PR non trovato'));
      }
      
      const percentualeProvvigione = pr.percentuale_provvigione || 0;
      const provvigioniCalcolate = (spesaPrevista * percentualeProvvigione) / 100;
      
      // [PRODUCTION] Removed console.log('[DEBUG] [Provvigioni] PR', currentPrId, '- Spesa:', spesaPrevista, '€ - Percentuale:', percentualeProvvigione, '% - Provvigioni calcolate:', provvigioniCalcolate.toFixed(2), '€');
      
      // Aggiorno le provvigioni del PR corrente
      db.run(`UPDATE pr SET provvigioni_da_pagare = provvigioni_da_pagare + ? WHERE id = ?`,
        [provvigioniCalcolate, currentPrId],
        function(err2) {
          if (err2) {
            console.error('[DEBUG] [Provvigioni] Errore update provvigioni PR:', err2);
            return callback && callback(err2);
          }
          
          // [PRODUCTION] Removed console.log('[DEBUG] [Provvigioni] Aggiornamento provvigioni completato per PR:', currentPrId, '- Provvigioni: +', provvigioniCalcolate.toFixed(2), '€');
          
          // Se ha un padre che è anche un PR, propago le provvigioni
          if (pr.fk_padre) {
            db.get(`SELECT id FROM pr WHERE id = ?`, [pr.fk_padre], (err3, padreRow) => {
              if (err3) {
                console.error('[DEBUG] [Provvigioni] Errore verifica padre PR:', err3);
                return callback && callback(err3);
              }
              
              if (padreRow) {
                // Controllo aggiuntivo per prevenire loop infiniti con padre
                if (prProcessati.has(pr.fk_padre)) {
                  // [PRODUCTION] Removed console.log('[DEBUG] [Provvigioni] LOOP PREVENUTO: Padre PR', pr.fk_padre, 'già processato, interrompo propagazione')
                  callback && callback(null);
                  return;
                }
                
                // Il padre è un PR, propago ricorsivamente
                // [PRODUCTION] Removed console.log('[DEBUG] [Provvigioni] Propago provvigioni al padre PR:', pr.fk_padre)
                aggiornaProvvigioniRicorsivo(pr.fk_padre);
              } else {
                // Il padre non è un PR (è admin), fine catena
                // [PRODUCTION] Removed console.log('[DEBUG] [Provvigioni] Padre non è un PR, fine propagazione provvigioni per:', currentPrId)
                callback && callback(null);
              }
            });
          } else {
            // Nessun padre, fine catena
            // [PRODUCTION] Removed console.log('[DEBUG] [Provvigioni] Nessun padre, fine propagazione provvigioni per:', currentPrId)
            callback && callback(null);
          }
        }
      );
    });
  }
  
  // Inizio la propagazione ricorsiva dal PR iniziale
  aggiornaProvvigioniRicorsivo(prId);
}

module.exports = {
  approvaRichiestaTavolo,
  rifiutaRichiestaTavolo,
  aggiornaProvvigioniETotaliPR
};
