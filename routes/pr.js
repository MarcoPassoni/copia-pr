const express = require('express');
const router = express.Router();
const { db } = require('../models/db');
const bcrypt = require('bcryptjs');
const { decryptUserData, decryptUserArray } = require('../utils/crypto');

// Middleware di autenticazione PR
function ensurePR(req, res, next) {
  if (req.session && req.session.user && req.session.user.ruolo === 'pr') {
    return next();
  }
  return res.redirect('/login');
}
// Visualizza tutti i tavoli prenotati dal PR loggato (sia approvati che in attesa)
router.get('/tavoli', ensurePR, (req, res) => {
  const prId = req.session.user.id;
  
  // Query unificata per ottenere sia tavoli approvati che richieste in attesa
  const sql = `
    SELECT 
      id,
      data,
      numero_persone,
      spesa_prevista,
      nome_tavolo,
      note_tavolo as note,
      'Approvato' as stato,
      omaggi,
      data as data_approvazione
    FROM storico_tavoli 
    WHERE pr_id = ?
    
    UNION ALL
    
    SELECT 
      id,
      data,
      numero_persone,
      spesa_prevista,
      nome_tavolo,
      note_tavolo as note,
      CASE 
        WHEN stato = 'in attesa' THEN 'In attesa'
        WHEN stato = 'approvato' THEN 'Approvato'
        WHEN stato = 'rifiutato' THEN 'Rifiutato'
        ELSE stato
      END as stato,
      omaggi,
      NULL as data_approvazione
    FROM richieste_tavoli 
    WHERE pr_id = ?
    
    ORDER BY data DESC
  `;
  
  db.all(sql, [prId, prId], (err, tavoli) => {
    if (err) return res.send('Errore nel recupero tavoli: ' + err.message);
    
    // [PRODUCTION] Removed console.log(`[TAVOLI PR] Caricati ${tavoli.length} tavoli per PR ${prId}`)
    res.render('pr/tavoli', { tavoli, user: req.session.user });
  });
});

// Funzione helper per ottenere statistiche complete di un PR e suoi subordinati
async function getComprehensiveStats(prId) {
  return new Promise((resolve, reject) => {
    // Query per ottenere tutti i figli del PR (ricorsiva)
    const getFigliQuery = `
      WITH RECURSIVE pr_hierarchy AS (
        SELECT id, nickname, fk_padre, 0 as level
        FROM pr 
        WHERE id = ? AND attivo = 1
        
        UNION ALL
        
        SELECT p.id, p.nickname, p.fk_padre, ph.level + 1
        FROM pr p
        INNER JOIN pr_hierarchy ph ON p.fk_padre = ph.id
        WHERE ph.level < 10 AND p.attivo = 1 -- Evita loop infiniti e filtra inattivi
      )
      SELECT * FROM pr_hierarchy WHERE level > 0
    `;
    
    db.all(getFigliQuery, [prId], (err, figli) => {
      if (err) return reject(err);
      
      // Array di tutti gli ID (PR principale + figli)
      const allIds = [prId, ...figli.map(f => f.id)];
      const placeholders = allIds.map(() => '?').join(',');
      
      // Query per statistiche personali del PR
      const statsPersonaliQuery = `
        SELECT 
          COUNT(st.id) as prenotazioni_personali,
          COALESCE(SUM(st.spesa_prevista), 0) as fatturato_personale,
          COALESCE(SUM(st.spesa_prevista * pr.percentuale_provvigione / 100), 0) as provvigioni_personali,
          pr.tot_spesa_tavolo as totale_spesa_personale,
          pr.tot_persone_portate as totale_persone_personali
        FROM pr 
        LEFT JOIN storico_tavoli st ON pr.id = st.pr_id
        WHERE pr.id = ?
        GROUP BY pr.id
      `;
      
      db.get(statsPersonaliQuery, [prId], (err2, statsPersonali) => {
        if (err2) return reject(err2);
        
        // Query per statistiche totali (PR + figli)
        const statsTotaliQuery = `
          SELECT 
            COUNT(st.id) as prenotazioni_totali,
            COALESCE(SUM(st.spesa_prevista), 0) as fatturato_totale,
            COALESCE(SUM(pr.tot_spesa_tavolo), 0) as totale_spesa_completa,
            COALESCE(SUM(pr.tot_persone_portate), 0) as totale_persone_complete
          FROM pr 
          LEFT JOIN storico_tavoli st ON pr.id = st.pr_id
          WHERE pr.id IN (${placeholders})
        `;
        
        db.get(statsTotaliQuery, allIds, (err3, statsTotali) => {
          if (err3) return reject(err3);
          
          // Calcola le provvigioni totali che il PR riceve dall'admin
          // = percentuale del PR principale * fatturato totale del sottoalbero
          db.get('SELECT percentuale_provvigione FROM pr WHERE id = ?', [prId], (err4, prData) => {
            if (err4) return reject(err4);
            
            const provvigioni_totali = statsTotali.fatturato_totale * (prData.percentuale_provvigione / 100);
            statsTotali.provvigioni_totali = provvigioni_totali;
            
            // Query per andamento mensile (ultimi 6 mesi)
            const andamentoQuery = `
              SELECT 
                asm.mese,
                SUM(asm.totale_mese) as totale
              FROM andamento_staff_mensile asm
              WHERE asm.pr_id IN (${placeholders})
              AND asm.mese >= date('now', '-6 months', 'start of month')
              GROUP BY asm.mese
              ORDER BY asm.mese
            `;
            
            db.all(andamentoQuery, allIds, (err5, andamento) => {
              if (err5) return reject(err5);
            
            // Query per dettagli dei figli
            const dettagliFigliQuery = `
              SELECT 
                p.id,
                p.nickname,
                'pr' as ruolo,
                COUNT(st.id) as prenotazioni,
                COALESCE(SUM(st.spesa_prevista), 0) as fatturato,
                p.provvigioni_da_pagare as provvigioni,
                p.tot_persone_portate as persone_portate
              FROM pr p
              LEFT JOIN storico_tavoli st ON p.id = st.pr_id
              WHERE p.id IN (${figli.map(() => '?').join(',')})
              GROUP BY p.id, p.nickname
              ORDER BY fatturato DESC
            `;
            
            if (figli.length > 0) {
              db.all(dettagliFigliQuery, figli.map(f => f.id), (err6, dettagliFigli) => {
                if (err6) return reject(err6);
                
                resolve({
                  statsPersonali: statsPersonali || { prenotazioni_personali: 0, fatturato_personale: 0, provvigioni_personali: 0 },
                  statsTotali: statsTotali || { prenotazioni_totali: 0, fatturato_totale: 0, provvigioni_totali: 0 },
                  andamento: andamento || [],
                  figli: dettagliFigli || []
                });
              });
            } else {
              resolve({
                statsPersonali: statsPersonali || { prenotazioni_personali: 0, fatturato_personale: 0, provvigioni_personali: 0 },
                statsTotali: statsTotali || { prenotazioni_totali: 0, fatturato_totale: 0, provvigioni_totali: 0 },
                andamento: andamento || [],
                figli: []
              });
            }
            }); // Chiusura per la query prData
          });
        });
      });
    });
  });
}

// Funzione per calcolare le provvigioni con gerarchia
async function calcolaProvvigioniConGerarchia(prId) {
  return new Promise((resolve, reject) => {
    // Query per ottenere tutte le provvigioni maturate dal PR
    const provvigioniMaturateQuery = `
      SELECT 
        COALESCE(SUM(spesa_prevista * p.percentuale_provvigione / 100), 0) as provvigioni_maturate
      FROM storico_tavoli st
      JOIN pr p ON st.pr_id = p.id
      WHERE st.pr_id = ?
    `;
    
    db.get(provvigioniMaturateQuery, [prId], (err, maturate) => {
      if (err) return reject(err);
      
      // Query per ottenere tutti i pagamenti ricevuti
      const pagamentiRicevutiQuery = `
        SELECT COALESCE(SUM(importo), 0) as pagamenti_ricevuti
        FROM pagamenti_provvigioni
        WHERE pr_destinatario_id = ?
      `;
      
      db.get(pagamentiRicevutiQuery, [prId], (err, pagamenti) => {
        if (err) return reject(err);
        
        // Verifica chi deve pagare questo PR (admin o padre)
        const gerarchia = `
          SELECT 
            p.fk_padre,
            CASE 
              WHEN EXISTS(SELECT 1 FROM pr WHERE fk_padre = p.id) THEN 1 
              ELSE 0 
            END as ha_figli,
            CASE 
              WHEN p.fk_padre = 1 THEN 'admin'
              ELSE padre.nickname 
            END as padre_nickname
          FROM pr p
          LEFT JOIN pr padre ON p.fk_padre = padre.id
          WHERE p.id = ?
        `;
        
        db.get(gerarchia, [prId], (err, info) => {
          if (err) return reject(err);
          
          const provvigioniMaturate = maturate.provvigioni_maturate || 0;
          const pagamentiRicevuti = pagamenti.pagamenti_ricevuti || 0;
          const provvigioniDaRicevere = provvigioniMaturate - pagamentiRicevuti;
          
          // Determina chi deve pagare
          let paganteDeterminato;
          if (!info.fk_padre || info.fk_padre === 1) {
            // PR di livello massimo o figlio diretto dell'admin, paga l'admin
            paganteDeterminato = { tipo: 'admin', id: 1, nome: 'Amministratore' };
          } else {
            // Verifica se il padre ha altri figli
            db.get('SELECT COUNT(*) as count FROM pr WHERE fk_padre = ? AND id != ?', 
              [info.fk_padre, prId], (err2, conteggio) => {
                if (err2) return reject(err2);
                
                if (conteggio.count > 0) {
                  // Il padre ha altri figli, quindi paga il padre
                  paganteDeterminato = { tipo: 'pr', id: info.fk_padre, nome: info.padre_nickname };
                } else {
                  // Il padre non ha altri figli, paga l'admin
                  paganteDeterminato = { tipo: 'admin', id: 1, nome: 'Amministratore' };
                }
                
                resolve({
                  provvigioni_maturate: provvigioniMaturate,
                  pagamenti_ricevuti: pagamentiRicevuti,
                  provvigioni_da_ricevere: provvigioniDaRicevere,
                  pagante: paganteDeterminato,
                  ha_figli_propri: info.ha_figli === 1
                });
              });
            return; // Evita il resolve finale
          }
          
          resolve({
            provvigioni_maturate: provvigioniMaturate,
            pagamenti_ricevuti: pagamentiRicevuti,
            provvigioni_da_ricevere: provvigioniDaRicevere,
            pagante: paganteDeterminato,
            ha_figli_propri: info.ha_figli === 1
          });
        });
      });
    });
  });
}

// Funzione per registrare un pagamento di provvigioni
async function registraPagamentoProvvigioni(prDestinatarioId, prPaganteId, importo, note = '') {
  return new Promise((resolve, reject) => {
    // Funzione helper per inserire il pagamento
    function inserisciPagamento(paganteId) {
      const insertPagamento = `
        INSERT INTO pagamenti_provvigioni 
        (pr_destinatario_id, pr_pagante_id, importo, note)
        VALUES (?, ?, ?, ?)
      `;
      
      db.run(insertPagamento, [prDestinatarioId, paganteId, importo, note], function(err) {
        if (err) return reject(err);
        
        // Aggiorna i totali nella tabella pr
        const updateTotali = `
          UPDATE pr 
          SET 
            provvigioni_totali_pagate = COALESCE(provvigioni_totali_pagate, 0) + ?,
            ultima_data_pagamento = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        
        db.run(updateTotali, [importo, prDestinatarioId], (err2) => {
          if (err2) return reject(err2);
          
          // [PRODUCTION] Removed console.log(`[PAGAMENTO PROVVIGIONI] Registrato pagamento di €${importo} per PR ${prDestinatarioId} da pagante ${paganteId}`)
          resolve(this.lastID);
        });
      });
    }
    
    // Se prPaganteId è null (pagamento da admin), usa l'ID dell'admin
    if (prPaganteId === null || prPaganteId === undefined) {
      // Trova l'ID dell'admin
      db.get('SELECT id FROM admin LIMIT 1', [], (err, admin) => {
        if (err) return reject(err);
        if (!admin) return reject(new Error('Admin non trovato'));
        
        // [PRODUCTION] Removed console.log(`[PAGAMENTO PROVVIGIONI] Pagamento da admin (ID: ${admin.id}) verso PR ${prDestinatarioId}`);
        inserisciPagamento(admin.id);
      });
    } else {
      // Pagamento tra PR
      // [PRODUCTION] Removed console.log(`[PAGAMENTO PROVVIGIONI] Pagamento tra PR: ${prPaganteId} -> ${prDestinatarioId}`)
      inserisciPagamento(prPaganteId);
    }
  });
}

// Funzione per statistiche dettagliate personali (PR senza figli)
async function getPersonalDetailedStats(prId) {
  return new Promise(async (resolve, reject) => {
    try {
      // Usa la nuova funzione per calcolare le provvigioni con gerarchia
      const provvigioniInfo = await calcolaProvvigioniConGerarchia(prId);
      
      // Query per statistiche complete personali
      const personalStatsQuery = `
        SELECT 
          COUNT(*) as prenotazioni_totali,
          COALESCE(SUM(spesa_prevista), 0) as fatturato_totale
        FROM storico_tavoli st
        WHERE st.pr_id = ?
      `;
      
      db.get(personalStatsQuery, [prId], (err, personalStats) => {
        if (err) {
          console.error('[PERSONAL STATS] Errore query personalStats:', err);
          return reject(err);
        }
        
        // [PRODUCTION] Removed console.log('[PERSONAL STATS] PersonalStats per PR', prId, ':', personalStats)
        
        // Query per persone portate totali
        const peopleQuery = `
          SELECT COALESCE(SUM(numero_persone), 0) as persone_portate
          FROM storico_tavoli 
          WHERE pr_id = ?
        `;
        
        db.get(peopleQuery, [prId], (err, peopleData) => {
          if (err) return reject(err);
          
          // Query per andamento mensile (ultimi 12 mesi)
          const andamentoQuery = `
            SELECT 
              strftime('%Y-%m', data) as mese,
              COUNT(*) as prenotazioni,
              COALESCE(SUM(spesa_prevista), 0) as fatturato,
              COALESCE(SUM(spesa_prevista * p.percentuale_provvigione / 100), 0) as provvigioni
            FROM storico_tavoli st
            JOIN pr p ON st.pr_id = p.id
            WHERE st.pr_id = ?
              AND date(data) >= date('now', '-12 months')
            GROUP BY strftime('%Y-%m', data)
            ORDER BY mese DESC
            LIMIT 12
          `;
          
          db.all(andamentoQuery, [prId], (err, andamento) => {
            if (err) return reject(err);
            
            // Query per ultimi tavoli (5 più recenti) - include sia approvati che in attesa/rifiutati
            const ultimiTavoliQuery = `
              SELECT 
                data,
                spesa_prevista as totale,
                numero_persone,
                (spesa_prevista * p.percentuale_provvigione / 100) as provvigione_singola,
                nome_tavolo,
                'Approvato' as stato
              FROM storico_tavoli st
              JOIN pr p ON st.pr_id = p.id
              WHERE st.pr_id = ?
              
              UNION ALL
              
              SELECT 
                data,
                spesa_prevista as totale,
                numero_persone,
                (spesa_prevista * p.percentuale_provvigione / 100) as provvigione_singola,
                nome_tavolo,
                CASE 
                  WHEN stato = 'approvata' THEN 'Approvato'
                  WHEN stato = 'rifiutata' THEN 'Rifiutato'
                  ELSE 'In attesa'
                END as stato
              FROM richieste_tavoli rt
              JOIN pr p ON rt.pr_id = p.id
              WHERE rt.pr_id = ?
              
              ORDER BY data DESC
              LIMIT 5
            `;
            
            db.all(ultimiTavoliQuery, [prId, prId], (err, ultimiTavoli) => {
              if (err) return reject(err);
              
              // Query per storico pagamenti ricevuti
              const storicoPagamentiQuery = `
                SELECT 
                  pp.importo,
                  pp.data_pagamento,
                  pp.note,
                  CASE 
                    WHEN pp.pr_pagante_id IS NULL THEN 'Amministratore'
                    ELSE pr_pagante.nickname
                  END as pagante_nome
                FROM pagamenti_provvigioni pp
                LEFT JOIN pr pr_pagante ON pp.pr_pagante_id = pr_pagante.id
                WHERE pp.pr_destinatario_id = ?
                ORDER BY pp.data_pagamento DESC
                LIMIT 10
              `;
              
              db.all(storicoPagamentiQuery, [prId], (err, storicoPagamenti) => {
                if (err) return reject(err);
                
                resolve({
                  prenotazioni_totali: personalStats.prenotazioni_totali || 0,
                  fatturato_totale: personalStats.fatturato_totale || 0,
                  provvigioni_maturate: provvigioniInfo.provvigioni_maturate || 0,
                  provvigioni_guadagnate: provvigioniInfo.provvigioni_maturate || 0, // Alias per compatibilità vista
                  provvigioni_pagate: provvigioniInfo.pagamenti_ricevuti || 0,
                  provvigioni_da_ricevere: provvigioniInfo.provvigioni_da_ricevere || 0,
                  persone_portate: peopleData.persone_portate || 0,
                  pagante_info: provvigioniInfo.pagante,
                  ha_figli_propri: provvigioniInfo.ha_figli_propri,
                  andamento_mensile: andamento || [],
                  ultimi_tavoli: ultimiTavoli || [],
                  storico_pagamenti: storicoPagamenti || []
                });
              });
            });
          });
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Dashboard PR
router.get('/dashboard', ensurePR, async (req, res) => {
  const userId = req.session.user.id;
  
  try {
    // Prima controlla se il PR ha figli
    const hasChildren = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM pr WHERE fk_padre = ?', [userId], (err, result) => {
        if (err) reject(err);
        else resolve(result.count > 0);
      });
    });
    
    if (hasChildren) {
      // Ha figli: usa la dashboard completa esistente
      const data = await getComprehensiveStats(userId);
      
      // Prepara i dati per i grafici
      const mesiNomi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
      const fatturatoMensile = [];
      const mesiLabels = [];
      
      // Processa i dati dell'andamento ordinati cronologicamente
      const andamentoSorted = [...data.andamento].sort((a,b) => a.mese.localeCompare(b.mese));
      andamentoSorted.forEach(item => {
        const [anno, mese] = item.mese.split('-');
        const meseIndex = parseInt(mese) - 1;
        mesiLabels.push(mesiNomi[meseIndex] + ' ' + anno.slice(-2));
        fatturatoMensile.push(parseFloat(item.totale) || 0);
      });
      
      // Se non ci sono dati negli ultimi 6 mesi, crea array vuoti
      if (fatturatoMensile.length === 0) {
        for (let i = 0; i < 6; i++) {
          const d = new Date();
          d.setMonth(d.getMonth() - (5 - i));
          const meseIndex = d.getMonth();
          mesiLabels.push(mesiNomi[meseIndex] + ' ' + d.getFullYear().toString().slice(-2));
          fatturatoMensile.push(0);
        }
      }
      
      const stats = {
        // Statistiche personali
        prenotazioni_personali: data.statsPersonali.prenotazioni_personali || 0,
        fatturato_personale: data.statsPersonali.fatturato_personale || 0,
        provvigioni_personali: data.statsPersonali.provvigioni_personali || 0,
        
        // Statistiche totali (personali + team)
        prenotazioni_totali: data.statsTotali.prenotazioni_totali || 0,
        fatturato_totale: data.statsTotali.fatturato_totale || 0,
        provvigioni_totali: data.statsTotali.provvigioni_totali || 0,
        
        // Dati per grafici
        mesi: mesiLabels,
        fatturatoMensile: fatturatoMensile,
        
        // Team info
        numero_figli: data.figli.length,
        has_team: data.figli.length > 0
      };
      
      // Decritta i dati dei subordinati
      const sottoStaffDecrypted = decryptUserArray(data.figli);
      
      res.render('pr/dashboard', { 
        stats, 
        sottoStaff: sottoStaffDecrypted, 
        user: req.session.user 
      });
      
    } else {
      // Non ha figli: usa la dashboard personale
      return res.redirect('/pr/dashboard-personal');
    }
    
  } catch (error) {
    console.error('[PR DASHBOARD] Errore nel caricamento statistiche:', error);
    // Fallback con dati vuoti
    const stats = {
      prenotazioni_personali: 0,
      fatturato_personale: 0,
      provvigioni_personali: 0,
      prenotazioni_totali: 0,
      fatturato_totale: 0,
      provvigioni_totali: 0,
      mesi: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu'],
      fatturatoMensile: [0, 0, 0, 0, 0, 0],
      numero_figli: 0,
      has_team: false
    };
    res.render('pr/dashboard', { stats, sottoStaff: [], user: req.session.user });
  }
});

// Dashboard personale per PR senza figli
router.get('/dashboard-personal', ensurePR, async (req, res) => {
  const userId = req.session.user.id;
  
  try {
    // Verifica che il PR non abbia figli (per sicurezza)
    const hasChildren = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM pr WHERE fk_padre = ?', [userId], (err, result) => {
        if (err) reject(err);
        else resolve(result.count > 0);
      });
    });
    
    if (hasChildren) {
      // Se ha figli, reindirizza alla dashboard completa
      return res.redirect('/pr/dashboard');
    }
    
    // Ottieni statistiche personali dettagliate
    const personalStats = await getPersonalDetailedStats(userId);
    
    // [PRODUCTION] Removed console.log('[PR DASHBOARD PERSONAL] Statistiche caricate per utente', userId, ':', personalStats)
    
    res.render('pr/dashboard-personal', { 
      stats: personalStats, 
      user: req.session.user 
    });
    
  } catch (error) {
    console.error('[PR DASHBOARD PERSONAL] Errore nel caricamento statistiche:', error);
    res.status(500).send('Errore nel caricamento delle statistiche');
  }
});

// Prenotazioni PR
router.get('/prenotazioni', ensurePR, async (req, res) => {
  const userId = req.session.user.id;
  db.all('SELECT * FROM richieste_tavoli WHERE pr_id = ? ORDER BY data DESC', [userId], (err, prenotazioni) => {
    if (err) return res.status(500).send('Errore DB');
    res.render('pr/prenotazioni', { prenotazioni, user: req.session.user });
  });
});

// Inserimento richiesta tavolo PR
router.post('/prenotazioni', ensurePR, (req, res) => {
  const userId = req.session.user.id;
  let { data, persone, spesa, omaggi, nome_tavolo, note } = req.body;
  const errors = [];
  if (!data || isNaN(Date.parse(data))) errors.push('Data non valida');
  const numeroPersone = parseInt(persone, 10);
  if (isNaN(numeroPersone) || numeroPersone <= 0 || numeroPersone > 500) errors.push('Numero persone non valido');
  const spesaNum = parseFloat(spesa);
  if (isNaN(spesaNum) || spesaNum < 0 || spesaNum > 100000) errors.push('Spesa non valida');
  nome_tavolo = (nome_tavolo || '').trim();
  if (!nome_tavolo || nome_tavolo.length < 2 || nome_tavolo.length > 100) errors.push('Nome tavolo non valido');
  note = (note || '').trim();
  omaggi = (omaggi || '').trim();
  if (errors.length > 0) {
    return res.status(400).send('Errore richiesta tavolo: ' + errors.join(', '));
  }
  db.run(`INSERT INTO richieste_tavoli (pr_id, data, numero_persone, spesa_prevista, omaggi, nome_tavolo, note_tavolo, stato)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'in attesa')`,
    [userId, data, numeroPersone, spesaNum, omaggi, nome_tavolo, note],
    function(err) {
      if (err) return res.status(500).send('Errore inserimento richiesta');
      res.redirect('/pr/prenotazioni');
    });
});

// Organigramma PR - Dashboard del Sotto-Staff
router.get('/organigramma', ensurePR, async (req, res) => {
  const userId = req.session.user.id;
  
  // [PRODUCTION] Removed console.log(`[ORGANIGRAMMA PR] Caricamento dashboard sotto-staff per PR ${userId}...`)
  
  // Query ricorsiva per ottenere tutto il sotto-staff del PR corrente (figli, nipoti, ecc.)
  const sottoStaffQuery = `
    WITH RECURSIVE sotto_staff_tree AS (
      -- Livello base: PR diretti sotto l'utente corrente
      SELECT 
        pr.id,
        pr.nickname,
        pr.nome,
        pr.cognome,
        'pr' as ruolo,
        pr.fk_padre,
        pr.percentuale_provvigione,
        pr.poteri,
        pr.tot_spesa_tavolo,
        pr.tot_persone_portate,
        pr.provvigioni_totali_maturate,
        pr.provvigioni_totali_pagate,
        (pr.provvigioni_totali_maturate - pr.provvigioni_totali_pagate) as provvigioni_guadagnate,
        1 as livello,
        pr.fk_padre as padre_id,
        (SELECT nickname FROM pr p2 WHERE p2.id = pr.fk_padre) as padre_nickname,
        -- Controlla se questo PR ha dei figli
        CASE 
          WHEN EXISTS(SELECT 1 FROM pr child WHERE child.fk_padre = pr.id AND child.attivo = 1) 
          THEN 1 ELSE 0 
        END as has_children
      FROM pr pr
      WHERE pr.fk_padre = ? AND pr.attivo = 1
      
      UNION ALL
      
      -- Livelli ricorsivi: PR sotto i PR già trovati (limite profondità per evitare query troppo pesanti)
      SELECT 
        pr.id,
        pr.nickname,
        pr.nome,
        pr.cognome,
        'pr' as ruolo,
        pr.fk_padre,
        pr.percentuale_provvigione,
        pr.poteri,
        pr.tot_spesa_tavolo,
        pr.tot_persone_portate,
        pr.provvigioni_totali_maturate,
        pr.provvigioni_totali_pagate,
        (pr.provvigioni_totali_maturate - pr.provvigioni_totali_pagate) as provvigioni_guadagnate,
        sst.livello + 1,
        pr.fk_padre as padre_id,
        (SELECT nickname FROM pr p2 WHERE p2.id = pr.fk_padre) as padre_nickname,
        -- Controlla se questo PR ha dei figli
        CASE 
          WHEN EXISTS(SELECT 1 FROM pr child WHERE child.fk_padre = pr.id AND child.attivo = 1) 
          THEN 1 ELSE 0 
        END as has_children
      FROM pr pr
      INNER JOIN sotto_staff_tree sst ON pr.fk_padre = sst.id
      WHERE pr.attivo = 1
        AND sst.livello < 6 -- evita ricorsione infinita su gerarchie molto profonde
    )
    SELECT 
      sst.*,
      -- Conta tavoli approvati per questo PR
      COALESCE(COUNT(st.id), 0) as count_storico_tavoli,
      -- Somma valore storico tavoli
      COALESCE(SUM(st.spesa_prevista), 0) as totale_storico_valore,
      -- Somma persone storiche
      COALESCE(SUM(st.numero_persone), 0) as totale_storico_persone
    FROM sotto_staff_tree sst
    LEFT JOIN storico_tavoli st ON sst.id = st.pr_id
    GROUP BY sst.id, sst.nickname, sst.nome, sst.cognome, sst.fk_padre, 
             sst.percentuale_provvigione, sst.poteri, sst.tot_spesa_tavolo, 
             sst.tot_persone_portate, sst.provvigioni_totali_maturate, 
             sst.provvigioni_totali_pagate, sst.livello, sst.padre_id, sst.padre_nickname, sst.has_children
    ORDER BY sst.livello ASC, sst.nickname ASC
  `;
  
  // Query per statistiche totali di tutto il sotto-staff (inclusi nipoti)
  const statisticheTotaliQuery = `
    WITH RECURSIVE sotto_staff_tree AS (
      SELECT id FROM pr WHERE fk_padre = ? AND attivo = 1
      UNION ALL
      SELECT pr.id FROM pr 
      INNER JOIN sotto_staff_tree sst ON pr.fk_padre = sst.id AND pr.attivo = 1
    )
    SELECT 
      COUNT(sst.id) as totaleSottoStaff,
      COALESCE(SUM(pr.tot_persone_portate), 0) as totalePersonePortate,
      COALESCE(SUM(pr.tot_spesa_tavolo), 0) as totaleValoreStorico,
      COALESCE(COUNT(st.id), 0) as totaleTavoli,
      COALESCE(SUM(pr.provvigioni_totali_maturate - pr.provvigioni_totali_pagate), 0) as totaleProvvigioni
    FROM sotto_staff_tree sst
    INNER JOIN pr ON sst.id = pr.id
    LEFT JOIN storico_tavoli st ON pr.id = st.pr_id
  `;
  
  // Esegui le query (misura durata per debug)
  console.time('[ORGANIGRAMMA PR] sottoStaffQuery duration');
  db.all(sottoStaffQuery, [userId], (err, sottoStaffData) => {
    console.timeEnd('[ORGANIGRAMMA PR] sottoStaffQuery duration');
    if (err) {
      console.error('[ORGANIGRAMMA PR] Errore query sotto-staff:', err.message);
      return res.status(500).send('Errore nel caricamento organigramma: ' + err.message);
    }
    
    db.get(statisticheTotaliQuery, [userId], (err2, statisticheTotali) => {
      if (err2) {
        console.error('[ORGANIGRAMMA PR] Errore query statistiche:', err2.message);
        return res.status(500).send('Errore nel caricamento statistiche: ' + err2.message);
      }
      
      // [PRODUCTION] Removed console.log(`[ORGANIGRAMMA PR] Sotto-staff caricato: ${sottoStaffData.length} membri`)
      // [PRODUCTION] Removed console.log(`[ORGANIGRAMMA PR] Statistiche totali:`, statisticheTotali)
      
      // Trova informazioni del PR corrente
      const prCorrenteQuery = `
        SELECT nickname, nome, cognome, poteri, percentuale_provvigione 
        FROM pr WHERE id = ?
      `;
      
      db.get(prCorrenteQuery, [userId], (err3, prCorrente) => {
        if (err3) {
          console.error('[ORGANIGRAMMA PR] Errore query PR corrente:', err3.message);
          return res.status(500).send('Errore nel caricamento dati PR: ' + err3.message);
        }
        
        const pr = prCorrente || {
          nickname: req.session.user.nickname,
          nome: 'Sconosciuto',
          cognome: 'Sconosciuto',
          poteri: 0,
          percentuale_provvigione: 0
        };
        
        // Prepara i dati per la vista (simile al report admin)
        const reportData = sottoStaffData.map(member => ({
          ...member,
          // Decrittografia dei dati se necessario
          nome: member.nome,
          cognome: member.cognome
        }));
        
        // Decritta i dati del PR principale e del sotto staff
        const prDecrypted = decryptUserData(pr);
        const sottoStaffDecrypted = decryptUserArray(sottoStaffData);
        
        res.render('pr/organigramma', { 
          pr: prDecrypted,
          reportData: sottoStaffDecrypted,
          sottoStaff: sottoStaffDecrypted,
          statisticheTotali: statisticheTotali || {
            totaleSottoStaff: 0,
            totalePersonePortate: 0,
            totaleValoreStorico: 0,
            totaleTavoli: 0,
            totaleProvvigioni: 0
          },
          user: req.session.user,
          // Aggiungi flag per distinguere dalla vista admin
          isManagerView: true
        });
      });
    });
  });
});

// Provvigioni PR
router.get('/provvigioni', ensurePR, async (req, res) => {
  const userId = req.session.user.id;
  
  try {
    // Ottieni informazioni dettagliate sulle provvigioni
    const provvigioniInfo = await calcolaProvvigioniConGerarchia(userId);
    
    // Query per storico completo dei pagamenti ricevuti
    const storicoPagamentiQuery = `
      SELECT 
        pp.importo,
        pp.data_pagamento,
        pp.note,
        CASE 
          WHEN pp.pr_pagante_id IS NULL THEN 'Amministratore'
          ELSE pr_pagante.nickname
        END as pagante_nome
      FROM pagamenti_provvigioni pp
      LEFT JOIN pr pr_pagante ON pp.pr_pagante_id = pr_pagante.id
      WHERE pp.pr_destinatario_id = ?
      ORDER BY pp.data_pagamento DESC
    `;
    
    db.all(storicoPagamentiQuery, [userId], (err, storicoPagamenti) => {
      if (err) {
        console.error('[PROVVIGIONI] Errore caricamento storico:', err);
        return res.status(500).send('Errore caricamento dati');
      }
      
      // Se il PR ha figli, mostra anche le provvigioni che deve pagare
      if (provvigioniInfo.ha_figli_propri) {
        const provvigioniDaPagareQuery = `
          WITH figli_diretti AS (
            SELECT id, nickname FROM pr WHERE fk_padre = ?
          )
          SELECT 
            f.id,
            f.nickname,
            COALESCE(SUM(st.spesa_prevista * p.percentuale_provvigione / 100), 0) as provvigioni_maturate,
            COALESCE(SUM(pp.importo), 0) as gia_pagate,
            (COALESCE(SUM(st.spesa_prevista * p.percentuale_provvigione / 100), 0) - COALESCE(SUM(pp.importo), 0)) as da_pagare
          FROM figli_diretti f
          JOIN pr p ON f.id = p.id
          LEFT JOIN storico_tavoli st ON f.id = st.pr_id
          LEFT JOIN pagamenti_provvigioni pp ON f.id = pp.pr_destinatario_id AND pp.pr_pagante_id = ?
          GROUP BY f.id, f.nickname
          HAVING da_pagare > 0
          ORDER BY da_pagare DESC
        `;
        
        db.all(provvigioniDaPagareQuery, [userId, userId], (err2, figliDaPagare) => {
          if (err2) {
            console.error('[PROVVIGIONI] Errore caricamento figli da pagare:', err2);
            return res.status(500).send('Errore caricamento dati figli');
          }
          
          // Decritta i dati dei figli da pagare
          const figliDecrypted = decryptUserArray(figliDaPagare || []);
          
          res.render('pr/provvigioni', { 
            provvigioni: {
              maturate: provvigioniInfo.provvigioni_maturate,
              ricevute: provvigioniInfo.pagamenti_ricevuti,
              daRicevere: provvigioniInfo.provvigioni_da_ricevere,
              pagante: provvigioniInfo.pagante,
              ha_figli: provvigioniInfo.ha_figli_propri,
              storico: storicoPagamenti,
              figli_da_pagare: figliDecrypted
            },
            user: req.session.user 
          });
        });
      } else {
        res.render('pr/provvigioni', { 
          provvigioni: {
            maturate: provvigioniInfo.provvigioni_maturate,
            ricevute: provvigioniInfo.pagamenti_ricevuti,
            daRicevere: provvigioniInfo.provvigioni_da_ricevere,
            pagante: provvigioniInfo.pagante,
            ha_figli: false,
            storico: storicoPagamenti,
            figli_da_pagare: []
          },
          user: req.session.user 
        });
      }
    });
    
  } catch (error) {
    console.error('[PROVVIGIONI] Errore generale:', error);
    res.status(500).send('Errore nel caricamento delle provvigioni');
  }
});

// Pagamento provvigioni ai figli (solo per PR con figli)
router.post('/paga-provvigioni', ensurePR, async (req, res) => {
  const userId = req.session.user.id;
  const { figlio_id, importo, note } = req.body;
  
  try {
    // Verifica che l'utente sia il padre del figlio da pagare
    const verificaFiglioQuery = `SELECT id FROM pr WHERE id = ? AND fk_padre = ?`;
    
    db.get(verificaFiglioQuery, [figlio_id, userId], async (err, figlio) => {
      if (err || !figlio) {
        return res.status(403).json({ 
          success: false, 
          message: 'Non autorizzato a pagare questo PR' 
        });
      }
      
      const importoNumerico = parseFloat(importo);
      if (isNaN(importoNumerico) || importoNumerico <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Importo non valido' 
        });
      }
      
      // Calcolo quanto è dovuto (da pagare) al figlio prima del pagamento
      const daPagareQuery = `
        SELECT (COALESCE(SUM(st.spesa_prevista * p.percentuale_provvigione / 100),0) - COALESCE(SUM(pp.importo),0)) AS da_pagare
        FROM pr p
        LEFT JOIN storico_tavoli st ON p.id = st.pr_id
        LEFT JOIN pagamenti_provvigioni pp ON p.id = pp.pr_destinatario_id AND pp.pr_pagante_id = ?
        WHERE p.id = ?
      `;
      db.get(daPagareQuery, [userId, figlio_id], async (errDue, dueRow) => {
        if (errDue) {
          return res.status(500).json({ success:false, message:'Errore calcolo dovuto' });
        }
        const daPagare = dueRow && dueRow.da_pagare ? parseFloat(dueRow.da_pagare) : 0;
        if (daPagare <= 0) {
          return res.status(400).json({ success:false, message:'Nessun importo dovuto' });
        }
        if (importoNumerico > daPagare + 0.0001) {
          return res.status(400).json({ success:false, message:`Importo supera il dovuto (€${daPagare.toFixed(2)})` });
        }
        const pagamentoId = await registraPagamentoProvvigioni(
          figlio_id,
          userId,
          importoNumerico,
          note || ''
        );
        res.json({ success:true, message:`Pagamento €${importoNumerico} registrato (dovuto residuo prima: €${daPagare.toFixed(2)})`, pagamento_id: pagamentoId });
      });
      
    });
    
  } catch (error) {
    console.error('[PAGAMENTO PR] Errore:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel registrare il pagamento' 
    });
  }
});

// Middleware per PR con poteri
function ensurePRWithPowers(req, res, next) {
  if (req.session && req.session.user && req.session.user.ruolo === 'pr') {
    // Verifica che il PR abbia i poteri attivi
    db.get('SELECT poteri FROM pr WHERE id = ?', [req.session.user.id], (err, row) => {
      if (err) {
        console.error('[POTERI PR] Errore verifica poteri:', err);
        return res.status(500).send('Errore interno');
      }
      
      if (!row || !row.poteri) {
        return res.status(403).send('Accesso negato: poteri PR richiesti');
      }
      
      return next();
    });
  } else {
    return res.redirect('/login');
  }
}

// Pagina richiesta nuovo PR (solo per PR con poteri)
router.get('/richiesta-nuovo-pr', ensurePRWithPowers, (req, res) => {
  const userId = req.session.user.id;
  
  // Query per ottenere info utente corrente
  const userQuery = `SELECT id, nickname, percentuale_provvigione, poteri FROM pr WHERE id = ?`;
  
  db.get(userQuery, [userId], (err, userInfo) => {
    if (err) {
      console.error('[RICHIESTA PR] Errore caricamento utente:', err);
      return res.status(500).send('Errore caricamento dati utente');
    }
    
    if (!userInfo) {
      return res.status(404).send('Utente non trovato');
    }
    
    // Query per ottenere i subordinati (figli diretti)
    const subordinatiQuery = `SELECT id, nickname FROM pr WHERE fk_padre = ?`;
    
    db.all(subordinatiQuery, [userId], (err2, subordinati) => {
      if (err2) {
        console.error('[RICHIESTA PR] Errore caricamento subordinati:', err2);
        return res.status(500).send('Errore caricamento subordinati');
      }
      
      // Decritta i dati del PR e subordinati
      const userInfoDecrypted = decryptUserData(userInfo);
      const subordinatiDecrypted = decryptUserArray(subordinati || []);
      
      res.render('pr/richiesta-nuovo-pr', { 
        userInfo: userInfoDecrypted, 
        subordinati: subordinatiDecrypted,
        user: req.session.user 
      });
    });
  });
});

// Gestione invio richiesta nuovo PR
router.post('/richiesta-nuovo-pr', ensurePRWithPowers, (req, res) => {
  const { nickname, nome, cognome, numero_telefono, password, percentuale_provvigione, padre_proposto_id, note_richiesta } = req.body;
  const prRichiedenteId = req.session.user.id;
  
  // Validazione server-side
  const errors = [];
  
  if (!nickname || nickname.length < 3 || !/^[a-zA-Z0-9_]+$/.test(nickname)) {
    errors.push('Nickname non valido');
  }
  
  if (!nome || nome.length < 2 || !/^[a-zA-ZàèéìòùÀÈÉÌÒÙ'\s-]+$/.test(nome)) {
    errors.push('Nome non valido');
  }
  
  if (!cognome || cognome.length < 2 || !/^[a-zA-ZàèéìòùÀÈÉÌÒÙ'\s-]+$/.test(cognome)) {
    errors.push('Cognome non valido');
  }
  
  if (!numero_telefono || !/^\d{8,15}$/.test(numero_telefono)) {
    errors.push('Numero telefono non valido');
  }
  
  if (!password || password.length < 6) {
    errors.push('Password troppo corta');
  }
  
  const percentuale = parseFloat(percentuale_provvigione);
  if (isNaN(percentuale) || percentuale < 0) {
    errors.push('Percentuale non valida');
  }
  
  if (!padre_proposto_id || isNaN(parseInt(padre_proposto_id))) {
    errors.push('Padre non selezionato');
  }
  
  if (errors.length > 0) {
    return res.render('pr/richiesta-nuovo-pr', {
      userInfo: { id: prRichiedenteId, percentuale_provvigione: req.session.user.percentuale_provvigione || 10 },
      subordinati: [],
      user: req.session.user,
      message: { type: 'error', text: 'Errori: ' + errors.join(', ') }
    });
  }
  
  // Verifica che il PR richiedente abbia i poteri e ottengo la sua percentuale
  db.get('SELECT percentuale_provvigione, poteri FROM pr WHERE id = ?', [prRichiedenteId], (err, prRichiedente) => {
    if (err || !prRichiedente || !prRichiedente.poteri) {
      return res.status(403).send('Accesso negato');
    }
    
    // Verifica che la percentuale richiesta non superi quella del richiedente
    if (percentuale > prRichiedente.percentuale_provvigione) {
      return res.render('pr/richiesta-nuovo-pr', {
        userInfo: { id: prRichiedenteId, percentuale_provvigione: prRichiedente.percentuale_provvigione },
        subordinati: [],
        user: req.session.user,
        message: { 
          type: 'error', 
          text: `La percentuale richiesta (${percentuale}%) supera la tua percentuale massima (${prRichiedente.percentuale_provvigione}%)` 
        }
      });
    }
    
    // Verifica che il padre proposto sia valido (il richiedente stesso o un suo subordinato)
    const padrePropostoId = parseInt(padre_proposto_id);
    
    if (padrePropostoId === prRichiedenteId) {
      // Il padre è il richiedente stesso - sempre valido
      inserisciRichiesta();
    } else {
      // Verifica che il padre sia un subordinato del richiedente
      db.get('SELECT id FROM pr WHERE id = ? AND fk_padre = ?', [padrePropostoId, prRichiedenteId], (err2, subordinato) => {
        if (err2 || !subordinato) {
          return res.render('pr/richiesta-nuovo-pr', {
            userInfo: { id: prRichiedenteId, percentuale_provvigione: prRichiedente.percentuale_provvigione },
            subordinati: [],
            user: req.session.user,
            message: { type: 'error', text: 'Il padre selezionato non è valido' }
          });
        }
        
        inserisciRichiesta();
      });
    }
    
    function inserisciRichiesta() {
      // Controlli preventivi per evitare duplicati e conflitti
      
      // 1. Controlla se esiste già una richiesta in attesa con lo stesso nickname
      db.get('SELECT id FROM richieste_creazione_pr WHERE nickname = ? AND stato = "in attesa"', [nickname], (err, existingRequest) => {
        if (err) {
          console.error('[RICHIESTA PR] Errore controllo duplicati richieste:', err);
          return res.status(500).send('Errore nella verifica dei dati');
        }
        
        if (existingRequest) {
          return res.render('pr/richiesta-nuovo-pr', {
            userInfo: { id: prRichiedenteId, percentuale_provvigione: prRichiedente.percentuale_provvigione },
            subordinati: [],
            user: req.session.user,
            message: { 
              type: 'error', 
              text: `Esiste già una richiesta in attesa per il nickname "${nickname}". Scegli un nickname diverso o attendi l'esito della richiesta precedente.` 
            }
          });
        }
        
        // 2. Controlla se il nickname esiste già nelle tabelle utenti attive
        const checkNicknameQuery = `
          SELECT 'admin' as tipo FROM admin WHERE nickname = ?
          UNION ALL
          SELECT 'pre_admin' as tipo FROM pre_admin WHERE nickname = ?
          UNION ALL
          SELECT 'pr' as tipo FROM pr WHERE nickname = ?
        `;
        
        db.get(checkNicknameQuery, [nickname, nickname, nickname], (err, existingUser) => {
          if (err) {
            console.error('[RICHIESTA PR] Errore controllo nickname esistenti:', err);
            return res.status(500).send('Errore nella verifica dei dati');
          }
          
          if (existingUser) {
            return res.render('pr/richiesta-nuovo-pr', {
              userInfo: { id: prRichiedenteId, percentuale_provvigione: prRichiedente.percentuale_provvigione },
              subordinati: [],
              user: req.session.user,
              message: { 
                type: 'error', 
                text: `Il nickname "${nickname}" è già in uso da un ${existingUser.tipo}. Scegli un nickname diverso.` 
              }
            });
          }
          
          // 3. Procedi con l'inserimento se tutti i controlli sono passati
          bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) {
              console.error('[RICHIESTA PR] Errore hash password:', err);
              return res.status(500).send('Errore nella generazione password');
            }
            
            // Inserisci la richiesta nel database
            const insertQuery = `
              INSERT INTO richieste_creazione_pr 
              (fk_richiedente, fk_padre_proposto, nickname, nome, cognome, numero_telefono, password, 
               percentuale_provvigione, note, stato)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in attesa')
            `;
            
            db.run(insertQuery, [
              prRichiedenteId, padrePropostoId, nickname, nome, cognome, numero_telefono, 
              hashedPassword, percentuale, note_richiesta || ''
            ], function(err) {
              if (err) {
                console.error('[RICHIESTA PR] Errore inserimento:', err);
                return res.status(500).send('Errore nell\'invio della richiesta');
              }
              
              // [PRODUCTION] Removed console.log(`[RICHIESTA PR] Nuova richiesta inviata - ID: ${this.lastID}, Richiedente: ${prRichiedenteId}, Nickname: ${nickname}, Padre proposto: ${padrePropostoId}`)
              
              res.render('pr/richiesta-nuovo-pr', {
                userInfo: { id: prRichiedenteId, percentuale_provvigione: prRichiedente.percentuale_provvigione },
                subordinati: [],
                user: req.session.user,
                message: { 
                  type: 'success', 
                  text: `Richiesta inviata con successo! ID richiesta: ${this.lastID}. Sarà esaminata dall'amministratore.` 
                }
              });
            });
          });
        });
      });
    }
  });
});

module.exports = router;
module.exports.registraPagamentoProvvigioni = registraPagamentoProvvigioni;
module.exports.calcolaProvvigioniConGerarchia = calcolaProvvigioniConGerarchia;
