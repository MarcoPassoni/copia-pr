/**
 * Sistema di isolamento dei dati per admin
 * Ogni admin vede solo i dati della sua gerarchia
 */

const { db } = require('../models/db'); // Importa la connessione al database

/**
 * Ottiene tutti i PR sotto la gerarchia di un admin (ricorsivamente)
 * @param {number} adminId - ID dell'admin
 * @returns {Promise<Array>} Lista di ID dei PR sotto questo admin
 */
function getPRHierarchy(adminId) {
  return new Promise((resolve, reject) => {
    const allPRIds = new Set();
    
    // Query per ottenere tutti i PR con le loro relazioni padre-figlio
    const query = `
      SELECT id, fk_padre, nickname
      FROM pr 
      ORDER BY id
    `;
    
    db.all(query, [], (err, allPRs) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Trova tutti i PR diretti dell'admin
      const directPRs = allPRs.filter(pr => pr.fk_padre === adminId);
      
      // Funzione ricorsiva per trovare tutti i discendenti
      // Protezione contro cicli: manteniamo un Set di nodi visitati
      const visited = new Set();
      function findDescendants(parentId) {
        if (visited.has(parentId)) return; // già processato
        visited.add(parentId);

        const children = allPRs.filter(pr => pr.fk_padre === parentId);
        children.forEach(child => {
          if (!visited.has(child.id)) {
            allPRIds.add(child.id);
            findDescendants(child.id); // Ricorsione sicura
          }
        });
      }
      
      // Aggiungi i PR diretti e trova tutti i loro discendenti
      directPRs.forEach(pr => {
        if (!visited.has(pr.id)) {
          allPRIds.add(pr.id);
          findDescendants(pr.id);
        }
      });
      
      resolve(Array.from(allPRIds));
    });
  });
}

/**
 * Ottiene tutti i pre-admin sotto un admin
 * @param {number} adminId - ID dell'admin
 * @returns {Promise<Array>} Lista di ID dei pre-admin
 */
function getPreAdminHierarchy(adminId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT id FROM pre_admin WHERE fk_admin = ?', 
      [adminId], 
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.id));
      }
    );
  });
}

/**
 * Crea le condizioni WHERE per filtrare i dati per un admin specifico
 * @param {number} adminId - ID dell'admin corrente
 * @returns {Promise<Object>} Oggetto con le condizioni di filtro
 */
async function createAdminFilter(adminId) {
  try {
    const [prIds, preAdminIds] = await Promise.all([
      getPRHierarchy(adminId),
      getPreAdminHierarchy(adminId)
    ]);
    
    return {
      adminId,
      prIds,
      preAdminIds,
      // Condizioni SQL ready-to-use
      prFilter: prIds.length > 0 ? `pr.id IN (${prIds.join(',')})` : '1=0',
      preAdminFilter: preAdminIds.length > 0 ? `pre_admin.id IN (${preAdminIds.join(',')})` : '1=0',
      anyPRFilter: prIds.length > 0 ? `id IN (${prIds.join(',')})` : '1=0'
    };
  } catch (error) {
    console.error('[ADMIN FILTER] Errore creazione filtri:', error);
    throw error;
  }
}

/**
 * Middleware per aggiungere i filtri admin alla request
 */
function addAdminFilter(req, res, next) {
  if (req.session && req.session.user && req.session.user.ruolo === 'admin') {
    createAdminFilter(req.session.user.id)
      .then(filter => {
        req.adminFilter = filter;
        console.log(`[ADMIN FILTER] Admin ${req.session.user.nickname} può vedere:`, {
          pr: filter.prIds.length,
          preAdmin: filter.preAdminIds.length
        });
        next();
      })
      .catch(err => {
        console.error('[ADMIN FILTER] Errore middleware:', err);
        next(err);
      });
  } else {
    next();
  }
}

/**
 * Controlla se un PR appartiene alla gerarchia dell'admin
 * @param {number} adminId - ID dell'admin
 * @param {number} prId - ID del PR da controllare
 * @returns {Promise<boolean>} True se il PR appartiene all'admin
 */
async function canAdminAccessPR(adminId, prId, ruoloCreato = 'pr') {
  try {
    // Super admin può creare tutto senza limitazioni
    const adminInfo = await getAdminInfo(adminId);
    if (adminInfo && adminInfo.ruolo === 'admin') {
      // [PRODUCTION] Removed console.log(`[ADMIN ACCESS] Admin ${adminId} può creare ${ruoloCreato} sotto padre ${prId} (è super admin)`);
      return true;
    }
    
    // Altri controlli per non-admin
    const filter = await createAdminFilter(adminId);
    const canAccess = filter.prIds.includes(prId);
    // [PRODUCTION] Removed console.log(`[ADMIN ACCESS] Admin ${adminId} accesso a PR ${prId}: ${canAccess}`)
    return canAccess;
  } catch (error) {
    console.error('[ADMIN FILTER] Errore controllo accesso PR:', error);
    return false;
  }
}

/**
 * Ottiene la query staff filtrata per admin
 * @param {number} adminId - ID dell'admin
 * @returns {Promise<string>} Query SQL filtrata
 */
async function getFilteredStaffQuery(adminId) {
  const filter = await createAdminFilter(adminId);
  
  return `
    SELECT a.id, a.nome, a.cognome, a.numero_telefono, a.nickname, 'admin' as ruolo, NULL as percentuale_provvigione, NULL as poteri, NULL as padre_nickname, NULL as padre_id FROM admin a
    
    UNION ALL
    
    SELECT p.id, p.nome, p.cognome, p.numero_telefono, p.nickname, 'pre_admin' as ruolo, NULL as percentuale_provvigione, NULL as poteri, a.nickname as padre_nickname, p.fk_admin as padre_id 
    FROM pre_admin p 
    LEFT JOIN admin a ON p.fk_admin = a.id 
    WHERE ${filter.preAdminFilter}
    
    UNION ALL
    
    SELECT pr.id, pr.nome, pr.cognome, pr.numero_telefono, pr.nickname, 'pr' as ruolo, pr.percentuale_provvigione, pr.poteri, 
      CASE 
        WHEN pr.fk_padre = ${adminId} THEN '${await getAdminNickname(adminId)}'
        WHEN EXISTS(SELECT 1 FROM pr pr3 WHERE pr3.id = pr.fk_padre AND pr3.id != pr.id) THEN (SELECT nickname FROM pr pr3 WHERE pr3.id = pr.fk_padre AND pr3.id != pr.id)
        ELSE 'Sconosciuto' 
      END as padre_nickname, pr.fk_padre as padre_id 
    FROM pr pr 
    WHERE pr.attivo = 1 AND ${filter.prFilter}
    
    ORDER BY ruolo DESC, nickname ASC
  `;
}

/**
 * Helper per ottenere il nickname dell'admin
 */
function getAdminNickname(adminId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT nickname FROM admin WHERE id = ?', [adminId], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.nickname : 'Admin');
    });
  });
}

/**
 * Ottiene informazioni complete dell'admin
 * @param {number} adminId - ID dell'admin
 * @returns {Promise<Object>} Info admin con ruolo
 */
function getAdminInfo(adminId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, nickname, nome, cognome, "admin" as ruolo FROM admin WHERE id = ?', [adminId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * Ottiene i tavoli filtrati per la gerarchia dell'admin
 * @param {number} adminId - ID dell'admin
 * @returns {Promise<string>} Query SQL per tavoli filtrati
 */
async function getFilteredTavoliQuery(adminId) {
  const filter = await createAdminFilter(adminId);
  
  if (filter.prIds.length === 0) {
    return 'SELECT * FROM richieste_tavoli WHERE 1=0'; // Nessun risultato
  }
  
  return `
    SELECT 
      rt.*,
      pr.nickname as pr_nickname,
      pr.nome as pr_nome,
      pr.cognome as pr_cognome
    FROM richieste_tavoli rt
    LEFT JOIN pr ON rt.pr_id = pr.id
    WHERE rt.pr_id IN (${filter.prIds.join(',')})
    ORDER BY rt.data DESC, rt.id DESC
  `;
}

/**
 * Ottiene lo storico tavoli filtrato per la gerarchia dell'admin
 * @param {number} adminId - ID dell'admin
 * @returns {Promise<string>} Query SQL per storico tavoli filtrato
 */
async function getFilteredStoricoTavoliQuery(adminId) {
  const filter = await createAdminFilter(adminId);
  
  if (filter.prIds.length === 0) {
    return 'SELECT * FROM storico_tavoli WHERE 1=0'; // Nessun risultato
  }
  
  return `
    SELECT 
      st.*,
      pr.nickname as pr_nickname,
      pr.nome as pr_nome,
      pr.cognome as pr_cognome
    FROM storico_tavoli st
    LEFT JOIN pr ON st.pr_id = pr.id
    WHERE st.pr_id IN (${filter.prIds.join(',')})
    ORDER BY st.data DESC, st.id DESC
  `;
}

/**
 * Ottiene le richieste creazione PR filtrate per la gerarchia dell'admin
 * @param {number} adminId - ID dell'admin
 * @returns {Promise<string>} Query SQL per richieste PR filtrate
 */
async function getFilteredRichiestePRQuery(adminId) {
  const filter = await createAdminFilter(adminId);
  
  // Le richieste PR possono essere create da PR nella gerarchia dell'admin
  if (filter.prIds.length === 0) {
    return 'SELECT * FROM richieste_creazione_pr WHERE 1=0'; // Nessun risultato
  }
  
  return `
    SELECT 
      rcp.*,
      pr.nickname as pr_richiedente_nickname,
      pr.nome as pr_richiedente_nome,
      pr.cognome as pr_richiedente_cognome
    FROM richieste_creazione_pr rcp
    LEFT JOIN pr ON rcp.pr_richiedente_id = pr.id
    WHERE rcp.pr_richiedente_id IN (${filter.prIds.join(',')})
    ORDER BY rcp.data_richiesta DESC
  `;
}

/**
 * Filtra i dati del database per visualizzazione admin
 * @param {number} adminId - ID dell'admin
 * @param {Object} allData - Tutti i dati dal database
 * @returns {Promise<Object>} Dati filtrati per l'admin
 */
async function filterDatabaseDataForAdmin(adminId, allData) {
  const filter = await createAdminFilter(adminId);
  
  return {
    // Tutti gli admin rimangono visibili
    admin: allData.admin || [],
    
    // Solo pre-admin della gerarchia
    pre_admin: (allData.pre_admin || []).filter(pa => 
      filter.preAdminIds.includes(pa.id)
    ),
    
    // Solo PR della gerarchia
    pr: (allData.pr || []).filter(pr => 
      filter.prIds.includes(pr.id)
    ),
    
    // Solo tavoli dei PR della gerarchia
    richieste_tavoli: (allData.richieste_tavoli || []).filter(rt => 
      filter.prIds.includes(rt.pr_id)
    ),
    
    // Solo storico tavoli dei PR della gerarchia
    storico_tavoli: (allData.storico_tavoli || []).filter(st => 
      filter.prIds.includes(st.pr_id)
    ),
    
    // Solo richieste PR della gerarchia
    richieste_creazione_pr: (allData.richieste_creazione_pr || []).filter(rcp => 
      filter.prIds.includes(rcp.pr_richiedente_id)
    )
  };
}

/**
 * Calcola statistiche filtrate per la gerarchia dell'admin
 * @param {number} adminId - ID dell'admin
 * @returns {Promise<Object>} Statistiche della gerarchia
 */
async function getAdminHierarchyStats(adminId) {
  const filter = await createAdminFilter(adminId);
  
  return new Promise((resolve, reject) => {
    if (filter.prIds.length === 0) {
      resolve({
        totalPR: 0,
        totalPreAdmin: filter.preAdminIds.length,
        totalTavoli: 0,
        totalFatturato: 0,
        totalProvvigioni: 0
      });
      return;
    }
    
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT pr.id) as total_pr,
        COUNT(DISTINCT st.id) as total_tavoli,
        COALESCE(SUM(st.spesa_prevista), 0) as total_fatturato,
        COALESCE(SUM(st.spesa_prevista * pr.percentuale_provvigione / 100), 0) as total_provvigioni
      FROM pr
      LEFT JOIN storico_tavoli st ON pr.id = st.pr_id
      WHERE pr.id IN (${filter.prIds.join(',')})
    `;
    
    db.get(statsQuery, [], (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      
      resolve({
        totalPR: stats.total_pr || 0,
        totalPreAdmin: filter.preAdminIds.length,
        totalTavoli: stats.total_tavoli || 0,
        totalFatturato: stats.total_fatturato || 0,
        totalProvvigioni: stats.total_provvigioni || 0
      });
    });
  });
}

module.exports = {
  getPRHierarchy,
  getPreAdminHierarchy,
  createAdminFilter,
  addAdminFilter,
  canAdminAccessPR,
  getFilteredStaffQuery,
  getFilteredTavoliQuery,
  getFilteredStoricoTavoliQuery,
  getFilteredRichiestePRQuery,
  filterDatabaseDataForAdmin,
  getAdminHierarchyStats
};
