const express = require('express');
const router = express.Router();
const { db, getAllUsers, getUserById, insertUser, updateUser, deleteUser } = require('../models/db');
const { decryptUserData, decryptUserArray } = require('../utils/crypto');
const { 
  addAdminFilter, 
  getFilteredStaffQuery, 
  canAdminAccessPR,
  getFilteredTavoliQuery,
  getFilteredStoricoTavoliQuery,
  getFilteredRichiestePRQuery,
  filterDatabaseDataForAdmin,
  getAdminHierarchyStats
} = require('../utils/admin-data-filter');
const bcrypt = require('bcryptjs');
const richieste = require('../models/richieste');
const { registraPagamentoProvvigioni, calcolaProvvigioniConGerarchia } = require('./pr');

// Middleware solo admin
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.ruolo === 'admin') return next();
  return res.redirect('/login');
}

// Route Esportazione Excel Overview
router.get('/overview/export-excel', isAdmin, async (req, res) => {
  const ExcelJS = require('exceljs');
  
  try {
    // Recupera tutti gli admin
    const admins = await new Promise((resolve, reject) => {
      db.all('SELECT id, nickname, nome, cognome FROM admin', (err, rows) => {
        if (err) reject(err);
        else resolve(decryptUserArray(rows));
      });
    });

    // Array per raccogliere i dati di ogni admin
    const adminBreakdown = [];
    let totalCostoTavoli = 0;
    let totalGuadagnoComplessivo = 0;
    let totalPR = 0;

    // Funzione per processare ogni admin
    const processAdmin = (admin) => {
      return new Promise((resolve) => {
        const hierarchyQuery = `
          WITH RECURSIVE gerarchia AS (
            SELECT id, fk_padre FROM pr WHERE fk_padre = ?
            UNION ALL
            SELECT pr.id, pr.fk_padre FROM pr
            INNER JOIN gerarchia ON pr.fk_padre = gerarchia.id
          )
          SELECT DISTINCT id FROM gerarchia
        `;

        db.all(hierarchyQuery, [admin.id], (err, prHierarchy) => {
          if (err) return resolve(null);

          const prIds = prHierarchy.map(pr => pr.id);
          const numPR = prIds.length;

          if (prIds.length === 0) {
            return resolve({
              nickname: admin.nickname,
              nome: admin.nome,
              cognome: admin.cognome,
              prCount: 0,
              costoTavoli: 0,
              guadagno: 0,
              percentuale: 0
            });
          }

          const placeholders = prIds.map(() => '?').join(',');
          const costoQuery = `
            SELECT COALESCE(SUM(spesa_prevista), 0) as totalCosto
            FROM storico_tavoli
            WHERE pr_id IN (${placeholders})
          `;

          db.get(costoQuery, prIds, (err, costoResult) => {
            if (err) return resolve(null);

            const costoTavoli = costoResult.totalCosto || 0;
            const guadagno = costoTavoli * 0.05;

            resolve({
              nickname: admin.nickname,
              nome: admin.nome,
              cognome: admin.cognome,
              prCount: numPR,
              costoTavoli: costoTavoli,
              guadagno: guadagno,
              percentuale: 0
            });
          });
        });
      });
    };

    // Processa tutti gli admin in parallelo
    const results = await Promise.all(admins.map(processAdmin));
    const validResults = results.filter(r => r !== null);
    
    validResults.forEach(admin => {
      totalCostoTavoli += admin.costoTavoli;
      totalGuadagnoComplessivo += admin.guadagno;
      totalPR += admin.prCount;
    });

    validResults.forEach(admin => {
      admin.percentuale = totalGuadagnoComplessivo > 0 
        ? (admin.guadagno / totalGuadagnoComplessivo) * 100 
        : 0;
      adminBreakdown.push(admin);
    });

    adminBreakdown.sort((a, b) => b.guadagno - a.guadagno);

    // Crea il workbook Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ICONIC Staff Management';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Overview Generale', {
      pageSetup: { paperSize: 9, orientation: 'landscape' }
    });

    // Stili
    const headerStyle = {
      font: { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } },
      alignment: { vertical: 'middle', horizontal: 'center' },
      border: {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      }
    };

    const titleStyle = {
      font: { name: 'Arial', size: 18, bold: true, color: { argb: 'FF667EEA' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    };

    const subtitleStyle = {
      font: { name: 'Arial', size: 12, italic: true, color: { argb: 'FF666666' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    };

    const statLabelStyle = {
      font: { name: 'Arial', size: 11, bold: true },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
      alignment: { vertical: 'middle', horizontal: 'left' }
    };

    const statValueStyle = {
      font: { name: 'Arial', size: 11, bold: true },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } },
      alignment: { vertical: 'middle', horizontal: 'right' },
      numFmt: '#,##0.00'
    };

    // Titolo
    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = '📊 OVERVIEW GENERALE - ICONIC';
    worksheet.getCell('A1').style = titleStyle;
    worksheet.getRow(1).height = 30;

    // Sottotitolo
    worksheet.mergeCells('A2:F2');
    worksheet.getCell('A2').value = `Rapporto generato il ${new Date().toLocaleDateString('it-IT', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    })}`;
    worksheet.getCell('A2').style = subtitleStyle;
    worksheet.getRow(2).height = 20;

    // Spazio
    worksheet.getRow(3).height = 10;

    // Statistiche principali
    let currentRow = 4;
    
    // Header statistiche
    worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = '💰 STATISTICHE COMPLESSIVE';
    worksheet.getCell(`A${currentRow}`).style = {
      font: { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF764BA2' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    };
    worksheet.getRow(currentRow).height = 25;
    currentRow++;

    // Statistiche dettagliate
    const stats = [
      { label: '💰 Costo Totale Tavoli', value: totalCostoTavoli, format: '€' },
      { label: '🎁 Guadagno Complessivo (5%)', value: totalGuadagnoComplessivo, format: '€' },
      { label: '👥 Admin Attivi', value: adminBreakdown.length, format: '' },
      { label: '🎯 PR Totali', value: totalPR, format: '' },
      { label: '💵 Valore Medio Tavolo', value: totalPR > 0 ? totalCostoTavoli / totalPR : 0, format: '€' },
      { label: '📊 Media Guadagno per Admin', value: adminBreakdown.length > 0 ? totalGuadagnoComplessivo / adminBreakdown.length : 0, format: '€' },
      { label: '📈 Media PR per Admin', value: adminBreakdown.length > 0 ? totalPR / adminBreakdown.length : 0, format: '' }
    ];

    stats.forEach(stat => {
      worksheet.getCell(`A${currentRow}`).value = stat.label;
      worksheet.getCell(`A${currentRow}`).style = statLabelStyle;
      worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
      
      worksheet.getCell(`D${currentRow}`).value = stat.format === '€' ? stat.value : stat.value;
      worksheet.getCell(`D${currentRow}`).style = statValueStyle;
      if (stat.format === '€') {
        worksheet.getCell(`D${currentRow}`).numFmt = '€#,##0.00';
      } else if (stat.label.includes('Media PR')) {
        worksheet.getCell(`D${currentRow}`).numFmt = '#,##0.0';
      }
      worksheet.mergeCells(`D${currentRow}:F${currentRow}`);
      worksheet.getRow(currentRow).height = 22;
      currentRow++;
    });

    // Spazio
    currentRow++;
    worksheet.getRow(currentRow).height = 15;
    currentRow++;

    // Tabella dettaglio amministratori
    worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = '📋 DETTAGLIO PER AMMINISTRATORE';
    worksheet.getCell(`A${currentRow}`).style = {
      font: { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    };
    worksheet.getRow(currentRow).height = 25;
    currentRow++;

    // Header tabella
    const headers = ['Admin', 'PR nella Gerarchia', 'Costo Totale Tavoli', 'Guadagno (5%)', '% sul Totale'];
    const headerRow = worksheet.getRow(currentRow);
    
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.style = headerStyle;
    });
    headerRow.height = 22;
    currentRow++;

    // Dati amministratori
    adminBreakdown.forEach((admin, index) => {
      const row = worksheet.getRow(currentRow);
      
      // Colonna A: Admin nickname
      row.getCell(1).value = admin.nickname;
      row.getCell(1).style = {
        font: { name: 'Arial', size: 10, bold: true },
        alignment: { vertical: 'middle', horizontal: 'left' }
      };
      
      // Colonna B: PR Count
      row.getCell(2).value = admin.prCount;
      row.getCell(2).style = {
        font: { name: 'Arial', size: 10 },
        alignment: { vertical: 'middle', horizontal: 'center' },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF9F9F9' : 'FFFFFFFF' } }
      };
      
      // Colonna C: Costo Tavoli
      row.getCell(3).value = admin.costoTavoli;
      row.getCell(3).numFmt = '€#,##0.00';
      row.getCell(3).style = {
        font: { name: 'Arial', size: 10, color: { argb: 'FF228B22' } },
        alignment: { vertical: 'middle', horizontal: 'right' },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF9F9F9' : 'FFFFFFFF' } }
      };
      
      // Colonna D: Guadagno
      row.getCell(4).value = admin.guadagno;
      row.getCell(4).numFmt = '€#,##0.00';
      row.getCell(4).style = {
        font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFF5576C' } },
        alignment: { vertical: 'middle', horizontal: 'right' },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF9F9F9' : 'FFFFFFFF' } }
      };
      
      // Colonna E: Percentuale
      row.getCell(5).value = admin.percentuale / 100;
      row.getCell(5).numFmt = '0.0%';
      row.getCell(5).style = {
        font: { name: 'Arial', size: 10 },
        alignment: { vertical: 'middle', horizontal: 'right' },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF9F9F9' : 'FFFFFFFF' } }
      };
      
      // Bordi
      [1, 2, 3, 4, 5].forEach(col => {
        row.getCell(col).border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      });
      
      row.height = 20;
      currentRow++;
    });

    // Totali
    const totalRow = worksheet.getRow(currentRow);
    totalRow.getCell(1).value = 'TOTALE';
    totalRow.getCell(1).style = {
      font: { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF764BA2' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    };
    
    totalRow.getCell(2).value = totalPR;
    totalRow.getCell(2).style = {
      font: { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF764BA2' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    };
    
    totalRow.getCell(3).value = totalCostoTavoli;
    totalRow.getCell(3).numFmt = '€#,##0.00';
    totalRow.getCell(3).style = {
      font: { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF764BA2' } },
      alignment: { vertical: 'middle', horizontal: 'right' }
    };
    
    totalRow.getCell(4).value = totalGuadagnoComplessivo;
    totalRow.getCell(4).numFmt = '€#,##0.00';
    totalRow.getCell(4).style = {
      font: { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF764BA2' } },
      alignment: { vertical: 'middle', horizontal: 'right' }
    };
    
    totalRow.getCell(5).value = '100%';
    totalRow.getCell(5).style = {
      font: { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF764BA2' } },
      alignment: { vertical: 'middle', horizontal: 'right' }
    };
    
    totalRow.height = 25;

    // Larghezza colonne
    worksheet.getColumn(1).width = 25;
    worksheet.getColumn(2).width = 20;
    worksheet.getColumn(3).width = 25;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 15;
    worksheet.getColumn(6).width = 15;

    // Footer con data/ora
    currentRow += 2;
    worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `Documento generato automaticamente da ICONIC Staff Management il ${new Date().toLocaleString('it-IT')}`;
    worksheet.getCell(`A${currentRow}`).style = {
      font: { name: 'Arial', size: 8, italic: true, color: { argb: 'FF999999' } },
      alignment: { vertical: 'middle', horizontal: 'center' }
    };

    // Genera il file
    const buffer = await workbook.xlsx.writeBuffer();
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ICONIC_Overview_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);

  } catch (error) {
    console.error('[EXPORT EXCEL] Errore:', error);
    res.status(500).send('Errore durante l\'esportazione Excel');
  }
});

// Route Overview Generale - Visibile solo admin
router.get('/overview', isAdmin, async (req, res) => {
  try {
    // Recupera tutti gli admin
    db.all('SELECT id, nickname, nome, cognome FROM admin', async (err, admins) => {
      if (err) {
        console.error('Errore recupero admin:', err);
        return res.status(500).send('Errore recupero dati');
      }

      // Decritta i nomi degli admin
      const adminsDecrypted = decryptUserArray(admins);

      // Array per raccogliere i dati di ogni admin
      const adminBreakdown = [];
      let totalCostoTavoli = 0;
      let totalGuadagnoComplessivo = 0;
      let totalPR = 0;

      // Funzione per processare ogni admin
      const processAdmin = (admin) => {
        return new Promise((resolve) => {
          // Ottieni la gerarchia di PR di questo admin usando fk_padre
          const hierarchyQuery = `
            WITH RECURSIVE gerarchia AS (
              SELECT id, fk_padre FROM pr WHERE fk_padre = ?
              UNION ALL
              SELECT pr.id, pr.fk_padre FROM pr
              INNER JOIN gerarchia ON pr.fk_padre = gerarchia.id
            )
            SELECT DISTINCT id FROM gerarchia
          `;

          db.all(hierarchyQuery, [admin.id], (err, prHierarchy) => {
            if (err) {
              console.error('Errore gerarchia admin:', err);
              return resolve(null);
            }

            const prIds = prHierarchy.map(pr => pr.id);
            const numPR = prIds.length;

            if (prIds.length === 0) {
              return resolve({
                nickname: admin.nickname,
                nome: admin.nome,
                cognome: admin.cognome,
                prCount: 0,
                costoTavoli: 0,
                guadagno: 0,
                percentuale: 0
              });
            }

            // Calcola il costo totale dei tavoli per questi PR
            const placeholders = prIds.map(() => '?').join(',');
            const costoQuery = `
              SELECT COALESCE(SUM(spesa_prevista), 0) as totalCosto
              FROM storico_tavoli
              WHERE pr_id IN (${placeholders})
            `;

            db.get(costoQuery, prIds, (err, costoResult) => {
              if (err) {
                console.error('Errore calcolo costo:', err);
                return resolve(null);
              }

              const costoTavoli = costoResult.totalCosto || 0;

              // Calcola il guadagno dell'admin (5% del costo totale)
              const guadagno = costoTavoli * 0.05;

              resolve({
                nickname: admin.nickname,
                nome: admin.nome,
                cognome: admin.cognome,
                prCount: numPR,
                costoTavoli: costoTavoli,
                guadagno: guadagno,
                percentuale: 0 // Calcolato dopo
              });
            });
          });
        });
      };

      // Processa tutti gli admin in parallelo
      const results = await Promise.all(adminsDecrypted.map(processAdmin));
      
      // Filtra risultati null e calcola totali
      const validResults = results.filter(r => r !== null);
      
      validResults.forEach(admin => {
        totalCostoTavoli += admin.costoTavoli;
        totalGuadagnoComplessivo += admin.guadagno;
        totalPR += admin.prCount;
      });

      // Calcola percentuali
      validResults.forEach(admin => {
        admin.percentuale = totalGuadagnoComplessivo > 0 
          ? (admin.guadagno / totalGuadagnoComplessivo) * 100 
          : 0;
        adminBreakdown.push(admin);
      });

      // Ordina per guadagno decrescente
      adminBreakdown.sort((a, b) => b.guadagno - a.guadagno);

      res.render('admin/overview', {
        layout: 'admin/layout-new',
        title: 'ICONIC - Overview Generale',
        currentPage: 'overview',
        adminBreakdown,
        totals: {
          totalCostoTavoli,
          totalGuadagnoComplessivo,
          totalPR
        }
      });
    });
  } catch (error) {
    console.error('Errore overview:', error);
    res.status(500).send('Errore nel caricamento overview');
  }
});

// Visualizza tutti i tavoli approvati (storico_tavoli) - CON FILTRO GERARCHIA ADMIN
router.get('/tavoli', isAdmin, addAdminFilter, async (req, res) => {
  try {
    const filtroData = req.query.data;
    const adminId = req.session.user.id;
    const adminFilter = req.adminFilter;
    
    // Se l'admin non ha PR nella sua gerarchia, mostra lista vuota
    if (adminFilter.prIds.length === 0) {
      console.log(`[TAVOLI] Admin ${req.session.user.nickname} non ha PR nella sua gerarchia`);
      return res.render('admin/tavoli', { 
        layout: 'admin/layout-new',
        title: 'ICONIC - Tavoli Approvati',
        currentPage: 'tavoli',
        tavoli: [], 
        filtroData,
        adminFilter
      });
    }
    
    // Query filtrata per PR nella gerarchia dell'admin
    let sql = `SELECT s.*, pr.nickname as pr_nickname, pr.nome as pr_nome, pr.cognome as pr_cognome
                 FROM storico_tavoli s
                 LEFT JOIN pr ON s.pr_id = pr.id
                 WHERE s.pr_id IN (${adminFilter.prIds.join(',')})`;
    
    const params = [];
    if (filtroData) {
      sql += ' AND s.data = ?';
      params.push(filtroData);
    }
    sql += ' ORDER BY s.data DESC';
    
    db.all(sql, params, (err, tavoli) => {
      if (err) {
        console.error('[TAVOLI] Errore query tavoli:', err);
        return res.send('Errore nel recupero tavoli: ' + err.message);
      }
      
      console.log(`[TAVOLI] Admin ${req.session.user.nickname} può vedere ${tavoli.length} tavoli approvati della sua gerarchia`);
      
      // Decritta i dati dei PR per la visualizzazione
      const tavoliDecrypted = tavoli.map(tavolo => {
        if (tavolo.pr_nome && tavolo.pr_cognome) {
          const decryptedPr = decryptUserData({
            nome: tavolo.pr_nome,
            cognome: tavolo.pr_cognome
          });
          tavolo.pr_nome = decryptedPr.nome;
          tavolo.pr_cognome = decryptedPr.cognome;
        }
        return tavolo;
      });
      
      res.render('admin/tavoli', { 
        layout: 'admin/layout-new',
        title: 'ICONIC - Tavoli Approvati',
        currentPage: 'tavoli',
        tavoli: tavoliDecrypted, 
        filtroData,
        adminFilter
      });
    });
    
  } catch (error) {
    console.error('[TAVOLI] Errore filtro admin:', error);
    res.status(500).send('Errore interno del server');
  }
});

// Gestione Staff con filtri per admin
router.get('/staff', isAdmin, addAdminFilter, async (req, res) => {
  try {
    // [PRODUCTION] Removed console.log(`[ADMIN STAFF] Admin ${req.session.user.nickname} (ID: ${req.session.user.id}) accede allo staff`);
    
    // Ottieni la query filtrata per questo admin
    const query = await getFilteredStaffQuery(req.session.user.id);
    
    db.all(query, [], (err, utenti) => {
      if (err) {
        console.error('[ADMIN STAFF] Errore query utenti:', err);
        return res.send('Errore nel recupero utenti: ' + err.message);
      }
      
      // [PRODUCTION] Removed console.log(`[ADMIN STAFF] Admin ${req.session.user.nickname} può vedere ${utenti.length} utenti`)
      
      // Decritta i dati sensibili di tutti gli utenti
      const utentiDecrypted = decryptUserArray(utenti);
      
      // Recupera le relazioni figlio solo per i PR visibili a questo admin
      const prIds = req.adminFilter.prIds;
      const preAdminIds = req.adminFilter.preAdminIds;
      
      let figliQuery = `
        SELECT id, nickname, 'admin' as ruolo, NULL as padre_id FROM admin WHERE id = ${req.session.user.id}
      `;
      
      if (preAdminIds.length > 0) {
        figliQuery += ` UNION ALL SELECT id, nickname, 'pre_admin' as ruolo, fk_admin as padre_id FROM pre_admin WHERE id IN (${preAdminIds.join(',')})`;
      }
      
      if (prIds.length > 0) {
        figliQuery += ` UNION ALL SELECT id, nickname, 'pr' as ruolo, fk_padre as padre_id FROM pr WHERE id IN (${prIds.join(',')})`;
      }
      
      db.all(figliQuery, [], (err2, figli) => {
        if (err2) {
          console.error('[ADMIN STAFF] Errore query relazioni:', err2);
          return res.send('Errore nel recupero relazioni: ' + err2.message);
        }
        
        // [PRODUCTION] Removed console.log(`[ADMIN STAFF] Relazioni caricate: ${figli.length} figli`)
        
        res.render('admin/staff', { 
          layout: 'admin/layout-new',
          title: 'ICONIC - Gestione Staff',
          currentPage: 'staff',
          utenti: utentiDecrypted, 
          figli 
        });
      });
    });
  } catch (error) {
    console.error('[ADMIN STAFF] Errore generale:', error);
    res.status(500).send('Errore interno del server');
  }
});

// Funzione per generare ID univoci globali con prefisso
function generateUniqueId(ruolo, callback) {
  const prefixes = { admin: 1000000, pre_admin: 2000000, pr: 3000000 };
  const baseId = prefixes[ruolo];
  
  // Trova il prossimo ID disponibile per questo ruolo
  const table = ruolo === 'admin' ? 'admin' : ruolo === 'pre_admin' ? 'pre_admin' : 'pr';
  db.get(`SELECT MAX(id) as maxId FROM ${table}`, [], (err, row) => {
    if (err) return callback(err);
    
    let nextId;
    if (!row.maxId || row.maxId < baseId) {
      nextId = baseId + 1; // Primo ID per questo ruolo
    } else {
      nextId = row.maxId + 1; // Incrementa dal massimo esistente
    }
    
    // [PRODUCTION] Removed console.log(`[ID_GENERATION] Nuovo ID per ${ruolo}: ${nextId}`)
    callback(null, nextId);
  });
}

// Funzione per validare e convertire padre_id con controlli di sicurezza
function validateAndConvertPadreId(padre_id, targetRuolo, callback) {
  // [PRODUCTION] Removed console.log(`[PADRE_VALIDATION] Input ricevuto - padre_id: "${padre_id}", tipo: ${typeof padre_id}, targetRuolo: ${targetRuolo}`)
  
  if (!padre_id || padre_id === "" || padre_id === "undefined" || padre_id === "null") {
    // [PRODUCTION] Removed console.log(`[PADRE_VALIDATION] Padre ID vuoto o nullo, restituisco null`)
    return callback(null, null);
  }
  
  const padreIdNum = parseInt(padre_id);
  if (isNaN(padreIdNum)) {
    // [PRODUCTION] Removed console.log(`[PADRE_VALIDATION] Padre ID non è un numero valido: ${padre_id}`)
    return callback(new Error('ID padre non valido'));
  }
  
  // [PRODUCTION] Removed console.log(`[PADRE_VALIDATION] Validazione padre ID: ${padreIdNum} per ruolo: ${targetRuolo}`)
  
  // Determina quale tabella controllare in base al ruolo target
  let queryTable, allowedRole;
  if (targetRuolo === 'pre_admin') {
    queryTable = 'admin';
    allowedRole = 'admin';
  } else if (targetRuolo === 'pr') {
    // PR può avere come padre sia admin che altri PR
    queryTable = 'admin UNION ALL SELECT id, nickname, \'pr\' as ruolo FROM pr';
    allowedRole = 'admin_or_pr';
  } else {
    return callback(new Error('Ruolo non supporta padre'));
  }
  
  // Verifica che il padre esista realmente
  const query = targetRuolo === 'pr' ? 
    `SELECT id, nickname, 'admin' as ruolo FROM admin WHERE id = ? UNION ALL SELECT id, nickname, 'pr' as ruolo FROM pr WHERE id = ?` :
    `SELECT id, nickname FROM admin WHERE id = ?`;
  
  const params = targetRuolo === 'pr' ? [padreIdNum, padreIdNum] : [padreIdNum];
  
  db.get(query, params, (err, row) => {
    if (err) return callback(err);
    if (!row) {
      // [PRODUCTION] Removed console.log(`[PADRE_VALIDATION] Padre con ID ${padreIdNum} non trovato nel database`)
      return callback(new Error(`Padre con ID ${padreIdNum} non trovato`));
    }
    
    // [PRODUCTION] Removed console.log(`[PADRE_VALIDATION] Padre validato: ID ${padreIdNum}, ruolo: ${row.ruolo || 'admin'}`)
    callback(null, padreIdNum);
  });
}

// Creazione nuovo utente
router.post('/staff/create', isAdmin, (req, res) => {
  const { ruolo, nome, cognome, numero_telefono, nickname, password, percentuale_provvigione, poteri, padre_id } = req.body;

  // Validazione server-side
  const errors = [];
  if (!nome || nome.length < 2 || !/^[a-zA-ZàèéìòùÀÈÉÌÒÙ'\s-]+$/.test(nome)) errors.push('Nome non valido');
  if (!cognome || cognome.length < 2 || !/^[a-zA-ZàèéìòùÀÈÉÌÒÙ'\s-]+$/.test(cognome)) errors.push('Cognome non valido');
  if (!numero_telefono || !/^\d{8,15}$/.test(numero_telefono)) errors.push('Numero di telefono non valido');
  if (!nickname || nickname.length < 3) errors.push('Nickname troppo corto');
  if (!password || password.length < 6) errors.push('Password troppo corta (min 6 caratteri)');
  if (ruolo === 'pr' && (percentuale_provvigione === undefined || isNaN(percentuale_provvigione) || percentuale_provvigione < 0 || percentuale_provvigione > 100)) errors.push('Percentuale provvigione non valida');
  if (errors.length > 0) {
    return res.status(400).send('Errore inserimento utente: ' + errors.join(', '));
  }

  const { nicknameExists } = require('../models/db');

  // Verifica unicità globale nickname prima di procedere
  nicknameExists(nickname, (errNick, exists) => {
    if (errNick) {
      return res.status(500).send('Errore verifica nickname');
    }
    if (exists) {
      return res.status(400).send('Nickname già esistente');
    }
    // Validazione padre_id con controlli di sicurezza
  validateAndConvertPadreId(padre_id, ruolo, (errPadre, padreIdValidato) => {
    if (errPadre) {
      return res.status(400).send('Errore validazione padre: ' + errPadre.message);
    }

    // Genera ID univoco per il nuovo utente
    generateUniqueId(ruolo, (errId, newUserId) => {
      if (errId) {
        return res.status(500).send('Errore generazione ID: ' + errId.message);
      }

      // Hash della password
      bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.send('Errore hash password');
        
        // Prepara i dati dell'utente per la crittografia automatica
        const userData = {
          id: newUserId,
          nome,
          cognome,
          numero_telefono,
          nickname,
          password: hash
        };

        if (ruolo === 'admin') {
          insertUser('admin', userData, (err, result) => {
            if (err) return res.send('Errore inserimento admin: ' + err.message);
            // [PRODUCTION] Removed console.log(`[CREAZIONE] Admin creato con ID univoco: ${newUserId} (dati crittografati)`);
            res.redirect('/admin/staff');
          });
        } else if (ruolo === 'pre_admin') {
          userData.fk_admin = padreIdValidato;
          insertUser('pre_admin', userData, (err, result) => {
            if (err) return res.send('Errore inserimento pre_admin: ' + err.message);
            // [PRODUCTION] Removed console.log(`[CREAZIONE] Pre_admin creato con ID univoco: ${newUserId}, padre: ${padreIdValidato} (dati crittografati)`);
            res.redirect('/admin/staff');
          });
        } else if (ruolo === 'pr') {
          userData.fk_padre = padreIdValidato;
          userData.percentuale_provvigione = percentuale_provvigione || 0;
          userData.poteri = poteri ? 1 : 0;
          insertUser('pr', userData, (err, result) => {
            if (err) return res.send('Errore inserimento PR: ' + err.message);
            // [PRODUCTION] Removed console.log(`[CREAZIONE] PR creato con ID univoco: ${newUserId}, padre: ${padreIdValidato} (dati crittografati)`);
            res.redirect('/admin/staff');
          });
        } else {
          res.send('Ruolo non valido');
        }
      });
    });
  });
  });
});

// Elimina utente con validazione ID
router.post('/staff/delete', isAdmin, (req, res) => {
  const { id, ruolo } = req.body;
  
  // Validazione ID e ruolo
  const userId = parseInt(id);
  if (isNaN(userId)) {
    return res.status(400).send('ID utente non valido');
  }
  
  if (!['admin', 'pre_admin', 'pr'].includes(ruolo)) {
    return res.status(400).send('Ruolo non valido');
  }

  // Protezione: non eliminare l'admin con ID 1 (admin principale)
  if (ruolo === 'admin' && userId === 1) {
    return res.status(403).send('Non è possibile eliminare l\'amministratore principale');
  }
  
  let table = ruolo === 'admin' ? 'admin' : ruolo === 'pre_admin' ? 'pre_admin' : 'pr';
  
  // Prima verifica che l'utente esista davvero
  db.get(`SELECT id, nickname FROM ${table} WHERE id = ?`, [userId], (err, row) => {
    if (err) return res.status(500).send('Errore verifica utente: ' + err.message);
    if (!row) return res.status(404).send('Utente non trovato');
    
    // Verifica se è l'ultimo admin rimasto
    if (ruolo === 'admin') {
      db.get('SELECT COUNT(*) as count FROM admin', [], (err, countResult) => {
        if (err) return res.status(500).send('Errore verifica admin: ' + err.message);
        
        if (countResult.count <= 1) {
          return res.status(403).send('Non è possibile eliminare l\'ultimo amministratore rimasto');
        }
        
        // Procedi con l'eliminazione
        procediEliminazione();
      });
    } else {
      // Per pre_admin e pr, procedi direttamente
      procediEliminazione();
    }
    
    function procediEliminazione() {
      // Soft delete per PR per preservare storico
      let deleteQuery = `DELETE FROM ${table} WHERE id = ?`;
      let softDeleted = false;
      if (table === 'pr') {
        deleteQuery = `UPDATE pr SET attivo = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`;
        softDeleted = true;
      }
      db.run(deleteQuery, [userId], (err) => {
        if (err) {
          console.error(`[ELIMINAZIONE] Errore eliminazione ${ruolo} ID ${userId}:`, err.message);
          return res.status(500).send('Errore eliminazione: ' + err.message);
        }
        const contentType = req.get('Content-Type');
        if (contentType && contentType.includes('application/x-www-form-urlencoded') && req.get('Accept')?.includes('text/html')) {
          res.redirect('/admin/staff');
        } else {
          res.status(200).json({ 
            success: true, 
            softDeleted,
            message: softDeleted ? `PR ${row.nickname} disattivato (soft delete)` : `Utente ${row.nickname} eliminato con successo`
          });
        }
      });
    }
  });
});

// Modifica utente con validazione avanzata
router.post('/staff/edit', isAdmin, (req, res) => {
  const { id, ruolo, nome, cognome, numero_telefono, nickname, password, percentuale_provvigione, padre_id } = req.body;
  
  console.log(`[MODIFICA_UTENTE] Dati ricevuti:`, {
    id, ruolo, nome, cognome, numero_telefono, nickname, 
    password: password ? '[PRESENTE]' : '[VUOTA]', 
    percentuale_provvigione, 
    padre_id: `"${padre_id}" (tipo: ${typeof padre_id})`
  });
  
  // Validazione ID utente
  const userId = parseInt(id);
  if (isNaN(userId)) {
    return res.status(400).send('ID utente non valido');
  }
  
  // Validazione ruolo
  if (!['admin', 'pre_admin', 'pr'].includes(ruolo)) {
    return res.status(400).send('Ruolo non valido');
  }
  
  // Per il checkbox poteri: se non presente, è 0
  let poteri = 0;
  if (ruolo === 'pr') {
    if (Array.isArray(req.body.poteri)) {
      poteri = req.body.poteri[req.body.poteri.length - 1] == '1' ? 1 : 0;
    } else {
      poteri = req.body.poteri == '1' ? 1 : 0;
    }
  }
  
  // [PRODUCTION] Removed console.log('[DEBUG] Modifica utente - ID:', userId, 'ruolo:', ruolo, 'poteri:', poteri)
  
  // Validazione padre_id con controlli di sicurezza
  validateAndConvertPadreId(padre_id, ruolo, (errPadre, padreIdValidato) => {
    if (errPadre) {
      // [PRODUCTION] Removed console.log(`[MODIFICA_UTENTE] Errore validazione padre:`, errPadre.message)
      return res.status(400).send('Errore validazione padre: ' + errPadre.message);
    }

    // [PRODUCTION] Removed console.log(`[MODIFICA_UTENTE] Padre validato: ${padreIdValidato}`)
    
    let table = ruolo === 'admin' ? 'admin' : ruolo === 'pre_admin' ? 'pre_admin' : 'pr';
    
    // Prima verifica che l'utente da modificare esista
    db.get(`SELECT id FROM ${table} WHERE id = ?`, [userId], (err, row) => {
      if (err) return res.send('Errore verifica utente: ' + err.message);
      if (!row) return res.status(404).send('Utente da modificare non trovato');
      
      // CONTROLLO SICUREZZA: Se si sta modificando un admin, deve essere se stesso
      if (ruolo === 'admin' && userId !== req.session.user.id) {
        // [PRODUCTION] Removed console.log(`[SICUREZZA] Admin ${req.session.user.nickname} (ID: ${req.session.user.id}) ha tentato di modificare admin ID ${userId} - BLOCCATO`);
        return res.status(403).send('❌ Non puoi modificare altri amministratori. Puoi modificare solo i tuoi dati.');
      }
      
      // [PRODUCTION] Removed console.log(`[MODIFICA_UTENTE] Controlli sicurezza superati per ${ruolo} ID ${userId}`)
      
      function cb(err) {
        if (err) return res.send('Errore modifica: ' + err.message);
        // [PRODUCTION] Removed console.log(`[MODIFICA] Utente modificato: ${ruolo} ID ${userId}`)
        res.redirect('/admin/staff?success=modifica');
      }
      
      if (password) {
        require('bcryptjs').hash(password, 10, (err, hashedPassword) => {
          if (err) return res.send('Errore hash password');
          
          // Prepara i dati per l'aggiornamento con crittografia automatica
          const userData = {
            nome,
            cognome,
            numero_telefono,
            nickname,
            password: hashedPassword
          };

          // Aggiungi campi specifici per ruolo
          if (ruolo === 'pre_admin') {
            userData.fk_admin = padreIdValidato;
          } else if (ruolo === 'pr') {
            userData.fk_padre = padreIdValidato;
            userData.percentuale_provvigione = percentuale_provvigione || 0;
            userData.poteri = poteri;
          }

          // Usa updateUser per crittografia automatica
          updateUser(table, userId, userData, (updateErr, result) => {
            if (updateErr) {
              console.error(`[MODIFICA] Errore aggiornamento ${ruolo} ID ${userId}:`, updateErr.message);
              return res.send('Errore modifica: ' + updateErr.message);
            }
            
            if (result && result.changes > 0) {
              // [PRODUCTION] Removed console.log(`[MODIFICA] Utente modificato con crittografia: ${ruolo} ID ${userId}`)
              res.redirect('/admin/staff?success=modifica');
            } else {
              return res.status(404).send('Utente non trovato per la modifica');
            }
          });
        });
      } else {
        // Aggiornamento senza password - usa comunque updateUser per crittografia
        const userData = {
          nome,
          cognome,
          numero_telefono,
          nickname
        };

        // Aggiungi campi specifici per ruolo
        if (ruolo === 'pre_admin') {
          userData.fk_admin = padreIdValidato;
        } else if (ruolo === 'pr') {
          userData.fk_padre = padreIdValidato;
          userData.percentuale_provvigione = percentuale_provvigione || 0;
          userData.poteri = poteri;
        }

        // Usa updateUser per crittografia automatica
        updateUser(table, userId, userData, (updateErr, result) => {
          if (updateErr) {
            console.error(`[MODIFICA] Errore aggiornamento ${ruolo} ID ${userId}:`, updateErr.message);
            return res.send('Errore modifica: ' + updateErr.message);
          }
          
          if (result && result.changes > 0) {
            // [PRODUCTION] Removed console.log(`[MODIFICA] Utente modificato con crittografia: ${ruolo} ID ${userId}`)
            res.redirect('/admin/staff?success=modifica');
          } else {
            return res.status(404).send('Utente non trovato per la modifica');
          }
        });
      }
    });
  });
});

// Richieste e Approvazioni
router.get('/approvazioni', isAdmin, addAdminFilter, async (req, res) => {
  // [PRODUCTION] Removed console.log(`[APPROVAZIONI] Admin ${req.session.user.nickname} (ID: ${req.session.user.id}) carica approvazioni della sua gerarchia`);
  
  try {
    const filter = req.adminFilter;
    
    if (filter.prIds.length === 0) {
      // [PRODUCTION] Removed console.log(`[APPROVAZIONI] Admin ${req.session.user.nickname} non ha PR nella sua gerarchia`)
      return res.render('admin/approvazioni', { 
        layout: 'admin/layout-new',
        title: 'ICONIC - Approvazioni',
        currentPage: 'approvazioni',
        richieste: [],
        adminFilter: filter
      });
    }
    
    // Query filtrata per le richieste in attesa dei PR dell'admin
    const query = `
      SELECT 
        r.*,
        pr.nickname as pr_nickname,
        pr.nome as pr_nome,
        pr.cognome as pr_cognome
      FROM richieste_tavoli r 
      JOIN pr ON r.pr_id = pr.id 
      WHERE r.stato = 'in attesa' AND r.pr_id IN (${filter.prIds.join(',')})
      ORDER BY r.data ASC
    `;
    
    db.all(query, [], (err, richieste) => {
      if (err) {
        console.error('[APPROVAZIONI] Errore query:', err);
        return res.status(500).send('Errore DB');
      }
      
      // [PRODUCTION] Removed console.log(`[APPROVAZIONI] Admin ${req.session.user.nickname} può vedere ${richieste.length} richieste in attesa`)
      
      res.render('admin/approvazioni', { 
        layout: 'admin/layout-new',
        title: 'ICONIC - Approvazioni',
        currentPage: 'approvazioni',
        richieste: richieste || [],
        adminFilter: filter
      });
    });
    
  } catch (error) {
    console.error('[APPROVAZIONI] Errore filtro admin:', error);
    res.status(500).send('Errore interno del server');
  }
});

// Approvazione richiesta tavolo con controllo gerarchia
router.post('/approvazioni/approva', isAdmin, addAdminFilter, async (req, res) => {
  const { id } = req.body;
  
  try {
    // Verifica che la richiesta appartenga alla gerarchia dell'admin
    const filter = req.adminFilter;
    
    if (filter.prIds.length === 0) {
      return res.status(403).send('Non hai PR nella tua gerarchia per approvare richieste');
    }
    
    // Controlla che la richiesta sia di un PR della gerarchia
    db.get('SELECT pr_id FROM richieste_tavoli WHERE id = ?', [id], (err, richiesta) => {
      if (err) {
        console.error('[APPROVAZIONE] Errore query verifica:', err);
        return res.status(500).send('Errore verifica richiesta');
      }
      
      if (!richiesta) {
        return res.status(404).send('Richiesta non trovata');
      }
      
      if (!filter.prIds.includes(richiesta.pr_id)) {
        // [PRODUCTION] Removed console.log(`[SICUREZZA] Admin ${req.session.user.nickname} ha tentato di approvare richiesta di PR ${richiesta.pr_id} non nella sua gerarchia - BLOCCATO`)
        return res.status(403).send('Non puoi approvare richieste di PR non nella tua gerarchia');
      }
      
      // Procedi con l'approvazione
      richieste.approvaRichiestaTavolo(id, (err) => {
        if (err) {
          console.error('[APPROVAZIONE] Errore:', err);
          return res.status(500).send('Errore approvazione richiesta: ' + err.message);
        }
        // [PRODUCTION] Removed console.log(`[APPROVAZIONE] Admin ${req.session.user.nickname} ha approvato richiesta ${id} - AUTORIZZATO`)
        res.redirect('/admin/approvazioni');
      });
    });
    
  } catch (error) {
    console.error('[APPROVAZIONE] Errore controlli sicurezza:', error);
    res.status(500).send('Errore interno del server');
  }
});

// Rifiuto richiesta tavolo con controllo gerarchia
router.post('/approvazioni/rifiuta', isAdmin, addAdminFilter, async (req, res) => {
  const { id } = req.body;
  
  try {
    // Verifica che la richiesta appartenga alla gerarchia dell'admin
    const filter = req.adminFilter;
    
    if (filter.prIds.length === 0) {
      return res.status(403).send('Non hai PR nella tua gerarchia per rifiutare richieste');
    }
    
    // Controlla che la richiesta sia di un PR della gerarchia
    db.get('SELECT pr_id FROM richieste_tavoli WHERE id = ?', [id], (err, richiesta) => {
      if (err) {
        console.error('[RIFIUTO] Errore query verifica:', err);
        return res.status(500).send('Errore verifica richiesta');
      }
      
      if (!richiesta) {
        return res.status(404).send('Richiesta non trovata');
      }
      
      if (!filter.prIds.includes(richiesta.pr_id)) {
        // [PRODUCTION] Removed console.log(`[SICUREZZA] Admin ${req.session.user.nickname} ha tentato di rifiutare richiesta di PR ${richiesta.pr_id} non nella sua gerarchia - BLOCCATO`)
        return res.status(403).send('Non puoi rifiutare richieste di PR non nella tua gerarchia');
      }
      
      // Procedi con il rifiuto
      richieste.rifiutaRichiestaTavolo(id, (err) => {
        if (err) {
          console.error('[RIFIUTO] Errore:', err);
          return res.status(500).send('Errore rifiuto richiesta: ' + err.message);
        }
        // [PRODUCTION] Removed console.log(`[RIFIUTO] Admin ${req.session.user.nickname} ha rifiutato richiesta ${id} - AUTORIZZATO`)
        res.redirect('/admin/approvazioni');
      });
    });
    
  } catch (error) {
    console.error('[RIFIUTO] Errore controlli sicurezza:', error);
    res.status(500).send('Errore interno del server');
  }
});

// Modifica richiesta tavolo
router.post('/approvazioni/modifica', isAdmin, (req, res) => {
  const { id, data, numero_persone, spesa_prevista, nome_tavolo, omaggi, note_tavolo, note_modifiche } = req.body;
  
  // Validazione dati
  if (!id || !data || !numero_persone || !spesa_prevista || !nome_tavolo || !note_modifiche) {
    return res.status(400).send('Dati mancanti per la modifica');
  }
  
  // Ottieni il nickname dell'utente che sta modificando
  const modificatoDaNickname = req.session.user.nickname;
  
  const updateQuery = `UPDATE richieste_tavoli 
                       SET data = ?, numero_persone = ?, spesa_prevista = ?, nome_tavolo = ?, 
                           omaggi = ?, note_tavolo = ?, note_modifiche = ?, modificata = 1, modificato_da_nickname = ?
                       WHERE id = ?`;
  
  db.run(updateQuery, [data, numero_persone, spesa_prevista, nome_tavolo, omaggi || '', note_tavolo || '', note_modifiche, modificatoDaNickname, id], function(err) {
    if (err) {
      console.error('[MODIFICA] Errore aggiornamento richiesta:', err);
      return res.status(500).send('Errore modifica richiesta: ' + err.message);
    }
    
    if (this.changes === 0) {
      return res.status(404).send('Richiesta non trovata');
    }
    
    // [PRODUCTION] Removed console.log(`[MODIFICA] Richiesta ID ${id} modificata con successo da ${modificatoDaNickname}`)
    res.redirect('/admin/approvazioni');
  });
});

// Report e Organigramma
router.get('/report', isAdmin, async (req, res) => {
  // [PRODUCTION] Removed console.log('[REPORT] Caricamento report gerarchico con calcoli ricorsivi...')
  
  // Import del sistema di crittografia per decodificare i nomi
  const { decryptUserData } = require('../utils/crypto');
  
  const adminId = req.session.user.id;
  const meseCorrente = new Date().toISOString().substring(0, 7); // YYYY-MM
  
  // [PRODUCTION] Removed console.log('[REPORT] Admin ID dalla sessione:', adminId)
  
  try {
    // Query per ottenere TUTTI i PR con le loro relazioni gerarchiche e dati di fatturato
    const allPrQuery = `
      SELECT 
        pr.id,
        pr.nickname,
        pr.nome,
        pr.cognome,
        pr.percentuale_provvigione,
        pr.poteri,
        pr.fk_padre,
        'pr' as ruolo,
        
        -- Determina il tipo e nickname del padre
        CASE 
          WHEN EXISTS(SELECT 1 FROM admin WHERE admin.id = pr.fk_padre) THEN 'admin'
          WHEN EXISTS(SELECT 1 FROM pr pr2 WHERE pr2.id = pr.fk_padre AND pr2.id != pr.id) THEN 'pr'
          ELSE 'none'
        END as padre_tipo,
        
        CASE 
          WHEN EXISTS(SELECT 1 FROM admin WHERE admin.id = pr.fk_padre) THEN (SELECT nickname FROM admin WHERE admin.id = pr.fk_padre)
          WHEN EXISTS(SELECT 1 FROM pr pr2 WHERE pr2.id = pr.fk_padre AND pr2.id != pr.id) THEN (SELECT nickname FROM pr pr2 WHERE pr2.id = pr.fk_padre AND pr2.id != pr.id)
          ELSE 'Nessuno' 
        END as padre_nickname,
        
        -- FATTURATO DIRETTO (tavoli chiusi personalmente)
        COALESCE((SELECT SUM(spesa_prevista) FROM storico_tavoli WHERE pr_id = pr.id), 0) as fatturato_diretto,
        COALESCE((SELECT COUNT(*) FROM storico_tavoli WHERE pr_id = pr.id), 0) as tavoli_diretti,
        COALESCE((SELECT SUM(numero_persone) FROM storico_tavoli WHERE pr_id = pr.id), 0) as persone_dirette,
        
        -- Provvigione sui propri tavoli diretti
        COALESCE((SELECT SUM(spesa_prevista * (pr.percentuale_provvigione / 100)) FROM storico_tavoli WHERE pr_id = pr.id), 0) as provvigione_diretta,
        
        -- DATI STORICO (mantenuti per compatibilità)
        COALESCE((SELECT SUM(numero_persone) FROM storico_tavoli WHERE pr_id = pr.id AND substr(data, 1, 7) = ?), 0) as persone_mese,
        COALESCE((SELECT COUNT(*) FROM storico_tavoli WHERE pr_id = pr.id AND substr(data, 1, 7) = ?), 0) as tavoli_mese,
        COALESCE((SELECT SUM(spesa_prevista) FROM storico_tavoli WHERE pr_id = pr.id AND substr(data, 1, 7) = ?), 0) as valore_mese,
        
        -- Flag per determinare se l'admin può pagare questo PR (deve essere figlio diretto)
        CASE WHEN pr.fk_padre = ? THEN 1 ELSE 0 END as puo_pagare
        
      FROM pr pr
      ORDER BY pr.nickname
    `;
    
    const allPrData = await new Promise((resolve, reject) => {
      db.all(allPrQuery, [meseCorrente, meseCorrente, meseCorrente, adminId], (err, rows) => {
        if (err) reject(err);
        else {
          // Decrittografa i dati sensibili (nome, cognome, nickname, padre_nickname)
          const decryptedRows = rows.map(row => {
            try {
              return {
                ...row,
                nickname: decryptUserData(row.nickname),
                nome: decryptUserData(row.nome),
                cognome: decryptUserData(row.cognome),
                // Decrittografa anche il padre_nickname se non è 'Nessuno'
                padre_nickname: row.padre_nickname && row.padre_nickname !== 'Nessuno' 
                  ? decryptUserData(row.padre_nickname) 
                  : row.padre_nickname
              };
            } catch (decryptError) {
              console.error('[REPORT] Errore decrittazione per PR ID:', row.id, decryptError.message);
              // Ritorna i dati originali se la decrittazione fallisce
              return row;
            }
          });
          resolve(decryptedRows);
        }
      });
    });
    
    // [PRODUCTION] Removed console.log('[REPORT] Trovati', allPrData.length, 'PR totali')
    
    // =====================================================================
    // ALGORITMO RICORSIVO PER CALCOLO PROVVIGIONI GERARCHICHE
    // =====================================================================
    
    function buildHierarchyTree(prList, parentId = null) {
      const children = prList.filter(pr => {
        if (parentId === null) {
          // Nodi radice: PR che hanno come padre l'admin
          return pr.padre_tipo === 'admin';
        } else {
          // Nodi figli: PR che hanno come padre il PR specificato
          return pr.fk_padre === parentId;
        }
      });
      
      return children.map(pr => ({
        ...pr,
        children: buildHierarchyTree(prList, pr.id)
      }));
    }
    
    function calculateHierarchicalCommissions(node) {
      // 1. Calcola ricorsivamente per tutti i figli
      const childrenResults = node.children.map(child => calculateHierarchicalCommissions(child));
      
      // 2. Calcola il fatturato del sottoalbero (incluso il nodo corrente)
      const fatturato_sottoalbero = node.fatturato_diretto + 
        childrenResults.reduce((sum, child) => sum + child.fatturato_sottoalbero, 0);
      
      // 3. CORREZIONE: La provvigione che il PR riceve dall'admin è calcolata su tutto il sottoalbero
      // ma poi deve essere distribuita a cascata
      const provvigione_totale_da_admin = fatturato_sottoalbero * (node.percentuale_provvigione / 100);
      
      // 4. Calcola quanto deve pagare ai figli 
      // Ogni figlio riceve la sua percentuale del proprio sottoalbero
      const pagamenti_ai_figli = childrenResults.reduce((sum, child) => {
        const importo_figlio = child.fatturato_sottoalbero * (child.percentuale_provvigione / 100);
        return sum + importo_figlio;
      }, 0);
      
      // 5. La provvigione netta che trattiene = quello che riceve - quello che paga ai figli
      const provvigione_netta_ricorsiva = provvigione_totale_da_admin - pagamenti_ai_figli;
      
      // 6. Il guadagno totale è la provvigione netta (già include la sua quota diretta)
      const guadagno_totale = provvigione_netta_ricorsiva;
      
      // 7. Determina livello gerarchico
      let livello_gerarchia = 0;
      let current = node;
      while (current.fk_padre && current.padre_tipo !== 'admin') {
        livello_gerarchia++;
        current = allPrData.find(pr => pr.id === current.fk_padre) || current;
        if (livello_gerarchia > 10) break; // Prevenzione loop infiniti
      }
      
      return {
        ...node,
        livello_gerarchia,
        fatturato_sottoalbero,
        provvigione_lorda: provvigione_totale_da_admin, // Rinomino per chiarezza
        pagamenti_ai_figli,
        provvigione_netta_ricorsiva,
        guadagno_totale,
        children_results: childrenResults
      };
    }
    
    function flattenHierarchy(hierarchyResults) {
      let flat = [];
      
      function traverse(nodes) {
        for (const node of nodes) {
          // Aggiungi il nodo corrente
          flat.push({
            id: node.id,
            nickname: node.nickname,
            nome: node.nome,
            cognome: node.cognome,
            percentuale_provvigione: node.percentuale_provvigione,
            poteri: node.poteri,
            fk_padre: node.fk_padre,
            padre_tipo: node.padre_tipo,
            padre_nickname: node.padre_nickname,
            livello_gerarchia: node.livello_gerarchia,
            puo_pagare: node.puo_pagare,
            
            // Dati originali
            fatturato_diretto: node.fatturato_diretto,
            tavoli_diretti: node.tavoli_diretti,
            persone_dirette: node.persone_dirette,
            provvigione_diretta: node.provvigione_diretta,
            
            // Nuovi calcoli ricorsivi
            fatturato_sottoalbero: node.fatturato_sottoalbero,
            provvigione_lorda: node.provvigione_lorda,
            pagamenti_ai_figli: node.pagamenti_ai_figli,
            provvigione_netta_ricorsiva: node.provvigione_netta_ricorsiva,
            guadagno_totale: node.guadagno_totale,
            
            // Compatibilità con template esistente
            persone_totali: node.persone_dirette,
            tavoli_totali: node.tavoli_diretti,
            valore_totali: node.fatturato_diretto,
            provvigioni_da_pagare: Math.max(0, node.guadagno_totale) // Quello che dovrebbe ricevere
          });
          
          // Ricorsione sui figli
          if (node.children_results && node.children_results.length > 0) {
            traverse(node.children_results);
          }
        }
      }
      
      traverse(hierarchyResults);
      return flat;
    }
    
    // Esegui i calcoli
    const hierarchyTree = buildHierarchyTree(allPrData);
    const hierarchyResults = hierarchyTree.map(node => calculateHierarchicalCommissions(node));
    const hierarchyData = flattenHierarchy(hierarchyResults);
    
    // [PRODUCTION] Removed console.log('[REPORT] Calcoli ricorsivi completati per', hierarchyData.length, 'PR')
    // [PRODUCTION] Removed console.log('[REPORT] PR diretti admin:', hierarchyData.filter(pr => pr.puo_pagare).map(pr => pr.nickname));
    
    // Debug: mostra alcuni calcoli
    hierarchyData.slice(0, 3).forEach(pr => {
      // [PRODUCTION] Removed console.log(`[CALC] ${pr.nickname}: fatturato_diretto=${pr.fatturato_diretto}€, fatturato_sottoalbero=${pr.fatturato_sottoalbero}€, provvigione_lorda=${pr.provvigione_lorda.toFixed(2)}€, netta=${pr.provvigione_netta_ricorsiva.toFixed(2)}€, guadagno_totale=${pr.guadagno_totale.toFixed(2)}€`);
    });
    
    // Calcola statistiche totali (solo PR diretti dell'admin)
    const directPrs = hierarchyData.filter(pr => pr.puo_pagare === 1);
    const statisticheTotali = {
      totalePRDiretti: directPrs.length,
      totalePRTotali: hierarchyData.length,
      
      // Statistiche aggregate
      totalePersonePortate: directPrs.reduce((sum, pr) => sum + (pr.persone_dirette || 0), 0),
      totaleTavoli: directPrs.reduce((sum, pr) => sum + (pr.tavoli_diretti || 0), 0),
      totaleFatturatoSottoalberi: directPrs.reduce((sum, pr) => sum + (pr.fatturato_sottoalbero || 0), 0),
      totaleProvvigioniLorde: directPrs.reduce((sum, pr) => sum + (pr.provvigione_lorda || 0), 0),
      totaleGuadagni: directPrs.reduce((sum, pr) => sum + (pr.guadagno_totale || 0), 0),
      
      // Compatibilità
      totaleProvvigioni: directPrs.reduce((sum, pr) => sum + (pr.provvigione_diretta || 0), 0),
      totaleValoreStorico: directPrs.reduce((sum, pr) => sum + (pr.fatturato_diretto || 0), 0),
      totaleProvvigioniDaPagare: directPrs.reduce((sum, pr) => sum + (pr.guadagno_totale || 0), 0)
    };
    
    // [PRODUCTION] Removed console.log('[REPORT] Statistiche calcolate:', statisticheTotali)
    
    res.render('admin/report', { 
      layout: 'admin/layout-new',
      title: 'ICONIC - Report Provvigioni Gerarchiche',
      currentPage: 'report',
      hierarchyData, // Lista piatta ordinata per livello
      statisticheTotali,
      adminId,
      meseCorrente: new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
    });
    
  } catch (error) {
    console.error('[REPORT] Errore:', error.message);
    res.status(500).send('Errore nel caricamento report: ' + error.message);
  }
});

// Endpoint per marcare come pagato e azzerare provvigioni (DEPRECATO - mantenuto per compatibilità)
router.post('/marca-pagato', isAdmin, (req, res) => {
  const { prId } = req.body;
  
  if (!prId) {
    return res.json({ success: false, error: 'ID PR mancante' });
  }
  
  // [PRODUCTION] Removed console.log(`[PAGAMENTO DEPRECATO] Tentativo di usare sistema vecchio per PR ${prId}`)
  
  // Redirect al nuovo sistema
  res.json({ 
    success: false, 
    error: 'Sistema deprecato. Utilizzare il nuovo sistema di pagamenti.' 
  });
});

// Endpoint per registrare un nuovo pagamento (nuovo sistema)
router.post('/register-payment', isAdmin, async (req, res) => {
  const { prId, amount, notes } = req.body;
  const adminId = req.session.user.id;
  
  // [PRODUCTION] Removed console.log('[PAYMENT] Registrazione pagamento:', { prId, amount, notes })
  
  if (!prId || !amount) {
    return res.json({ success: false, error: 'Dati mancanti (PR ID o importo)' });
  }
  
  try {
    // Verifica che l'admin possa pagare questo PR (deve essere suo figlio diretto)
    const checkQuery = 'SELECT id, nickname, fk_padre FROM pr WHERE id = ? AND fk_padre = ?';
    const prData = await new Promise((resolve, reject) => {
      db.get(checkQuery, [prId, adminId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!prData) {
      return res.json({ success: false, error: 'Non hai i permessi per pagare questo PR' });
    }
    
    // Registra il pagamento nella tabella pagamenti_provvigioni
    const insertPaymentQuery = `
      INSERT INTO pagamenti_provvigioni 
      (pr_destinatario_id, admin_pagante_id, importo, note_pagamento, data_pagamento) 
      VALUES (?, ?, ?, ?, datetime('now'))
    `;
    
    await new Promise((resolve, reject) => {
      db.run(insertPaymentQuery, [prId, adminId, amount, notes || null], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
    
    // [PRODUCTION] Removed console.log('[PAYMENT] Pagamento registrato con successo per PR:', prData.nickname)
    
    res.json({ 
      success: true, 
      message: `Pagamento di €${amount} registrato per ${prData.nickname}` 
    });
    
  } catch (error) {
    console.error('[PAYMENT] Errore durante registrazione pagamento:', error.message);
    res.json({ success: false, error: error.message });
  }
});
router.post('/get-provvigioni-info', ensureAdmin, async (req, res) => {
  const { pr_id } = req.body;
  
  if (!pr_id) {
    return res.json({ success: false, message: 'ID PR mancante' });
  }
  
  try {
    // Usa la funzione esistente per calcolare le provvigioni
    const provvigioniInfo = await calcolaProvvigioniConGerarchia(pr_id);
    
    if (provvigioniInfo.provvigioni_da_ricevere <= 0) {
      return res.json({ 
        success: false, 
        message: 'Nessuna provvigione da pagare per questo PR' 
      });
    }
    
    // Verifica chi deve pagare questo PR
    if (provvigioniInfo.pagante.tipo !== 'admin') {
      return res.json({ 
        success: false, 
        message: `Questo PR deve essere pagato da ${provvigioniInfo.pagante.nome}, non dall'admin` 
      });
    }
    
    res.json({
      success: true,
      importo: provvigioniInfo.provvigioni_da_ricevere,
      pr_id: pr_id,
      pagante_info: provvigioniInfo.pagante
    });
    
  } catch (error) {
    console.error('[GET PROVVIGIONI INFO] Errore:', error);
    res.json({ 
      success: false, 
      message: 'Errore nel calcolo delle provvigioni: ' + error.message 
    });
  }
});

// Calendario e Attività
router.get('/calendario', isAdmin, addAdminFilter, async (req, res) => {
  // [PRODUCTION] Removed console.log(`[CALENDARIO] Admin ${req.session.user.nickname} (ID: ${req.session.user.id}) carica calendario della sua gerarchia`);
  
  try {
    // Ottieni query filtrata per tavoli dell'admin
    const tavoliQuery = await getFilteredTavoliQuery(req.session.user.id);
    const storicoQuery = await getFilteredStoricoTavoliQuery(req.session.user.id);
    
    // Esegui query per richieste tavoli
    db.all(tavoliQuery, [], (err, richieste) => {
      if (err) {
        console.error('[CALENDARIO] Errore query richieste tavoli:', err);
        return res.status(500).send('Errore caricamento richieste tavoli');
      }
      
      // Esegui query per storico tavoli
      db.all(storicoQuery, [], (err2, storico) => {
        if (err2) {
          console.error('[CALENDARIO] Errore query storico tavoli:', err2);
          return res.status(500).send('Errore caricamento storico tavoli');
        }
        
        // [PRODUCTION] Removed console.log(`[CALENDARIO] Admin ${req.session.user.nickname} può vedere ${richieste.length} richieste e ${storico.length} tavoli storici`)
        
        res.render('admin/calendario', {
          layout: 'admin/layout-new',
          title: 'ICONIC - Calendario e Attività',
          currentPage: 'calendario',
          richiesteTavoli: richieste || [],
          storicoTavoli: storico || [],
          adminFilter: req.adminFilter
        });
      });
    });
    
  } catch (error) {
    console.error('[CALENDARIO] Errore filtro admin:', error);
    res.status(500).send('Errore interno del server');
  }
});

// Test organigramma semplice
router.get('/organigramma-test', isAdmin, (req, res) => {
  res.render('admin/organigramma-test', { 
    layout: 'admin/layout-new',
    title: 'Test Organigramma',
    currentPage: 'organigramma'
  });
});

// Organigramma dinamico con filtro admin
router.get('/organigramma', isAdmin, addAdminFilter, async (req, res) => {
  // [PRODUCTION] Removed console.log(`[ORGANIGRAMMA] Admin ${req.session.user.nickname} carica organigramma della sua gerarchia`)
  
  // Import del sistema di crittografia
  const { decryptUserArray } = require('../utils/crypto');
  
  try {
    // Ottieni la query filtrata per questo admin
    const query = await getFilteredStaffQuery(req.session.user.id);
    
    db.all(query, [], (err, organigrammaData) => {
      if (err) {
        console.error('[ORGANIGRAMMA] Errore query:', err.message);
        return res.status(500).send('Errore nel caricamento organigramma: ' + err.message);
      }
      
      // [PRODUCTION] Removed console.log(`[ORGANIGRAMMA] Admin ${req.session.user.nickname} può vedere ${organigrammaData.length} utenti`)
      
      // Decripta i dati sensibili
      const organigrammaDataDecrypted = decryptUserArray(organigrammaData);
      
      // Debug: mostra gli utenti visibili all'admin
      // [PRODUCTION] Removed console.log(`\n=== DEBUG ORGANIGRAMMA ADMIN ${req.session.user.nickname} ===`)
      organigrammaDataDecrypted.forEach(user => {
        // [PRODUCTION] Removed console.log(`ID: ${user.id}, Nickname: ${user.nickname}, Nome: ${user.nome} ${user.cognome}, Ruolo: ${user.ruolo}, Padre ID: ${user.padre_id}, Padre Nickname: ${user.padre_nickname}`)
      });
      // [PRODUCTION] Removed console.log('=== FINE DEBUG ===\n')
      
      // Statistiche per ruolo (solo per gli utenti visibili)
      const statistiche = {
        admin: organigrammaDataDecrypted.filter(u => u.ruolo === 'admin').length,
        pre_admin: organigrammaDataDecrypted.filter(u => u.ruolo === 'pre_admin').length,
        pr: organigrammaDataDecrypted.filter(u => u.ruolo === 'pr').length,
        totale: organigrammaDataDecrypted.length
      };
      
      res.render('admin/organigramma', { 
        layout: 'admin/layout-new',
        title: 'ICONIC - Organigramma',
        currentPage: 'organigramma',
        organigrammaData: organigrammaDataDecrypted,
        statistiche
      });
    });
  } catch (error) {
    console.error('[ORGANIGRAMMA] Errore nel filtro admin:', error);
    res.status(500).send('Errore interno del server');
  }
});

// Pagina aggiunta nuovo utente - con filtro admin
router.get('/nuovo-utente', isAdmin, addAdminFilter, (req, res) => {
  // Recupera solo gli utenti che questo admin può gestire come possibili padri
  const adminFilter = req.adminFilter;
  
  let query = `SELECT ${req.session.user.id} as id, '${req.session.user.nickname}' as nickname, 'admin' as ruolo`;
  
  if (adminFilter.preAdminIds.length > 0) {
    query += ` UNION ALL SELECT p.id, p.nickname, 'pre_admin' as ruolo FROM pre_admin p WHERE p.id IN (${adminFilter.preAdminIds.join(',')})`;
  }
  
  if (adminFilter.prIds.length > 0) {
    query += ` UNION ALL SELECT pr.id, pr.nickname, 'pr' as ruolo FROM pr pr WHERE pr.id IN (${adminFilter.prIds.join(',')})`;
  }
  
  // [PRODUCTION] Removed console.log(`[NUOVO UTENTE] Admin ${req.session.user.nickname} può scegliere padri nella sua gerarchia`)
  
  db.all(query, [], (err, utenti) => {
    if (err) {
      console.error('[NUOVO UTENTE] Errore query padri disponibili:', err);
      return res.send('Errore nel recupero padri: ' + err.message);
    }
    
    const errorMessages = req.flash('error');
    const successMessages = req.flash('success');
    
    // [PRODUCTION] Removed console.log(`[NUOVO UTENTE] ${utenti.length} padri disponibili per admin ${req.session.user.nickname}`)
    
    res.render('admin/nuovo-utente', { 
      layout: 'admin/layout-new',
      title: 'ICONIC - Nuovo Utente',
      currentPage: 'nuovo-utente',
      utenti,
      errorMessage: errorMessages.length > 0 ? errorMessages[0] : '',
      successMessage: successMessages.length > 0 ? successMessages[0] : '',
      formData: req.flash('formData')[0] || {} // Preserva dati inseriti
    });
  });
});

// Gestione creazione nuovo utente dalla pagina dedicata con validazioni avanzate e filtro admin
router.post('/nuovo-utente', isAdmin, addAdminFilter, async (req, res) => {
  // [PRODUCTION] Removed console.log(`[FORM SUBMIT] POST ricevuto per nuovo utente da ${req.session.user.nickname}`)
  // [PRODUCTION] Removed console.log(`[FORM DATA] Body:`, req.body)
  
  const { ruolo, nome, cognome, numero_telefono, nickname, password, percentuale_provvigione, poteri, padre_id } = req.body;
  
  // [PRODUCTION] Removed console.log(`[DEBUG] Admin ${req.session.user.nickname} crea nuovo utente - ruolo: ${ruolo}, padre_id: ${padre_id}`)
  
  // Salva i dati del form per ripopolare in caso di errore
  req.flash('formData', req.body);
  
  // Validazione server-side
  const errors = [];
  if (!nome || nome.length < 2 || !/^[a-zA-ZàèéìòùÀÈÉÌÒÙ'\s-]+$/.test(nome)) errors.push('Nome non valido');
  if (!cognome || cognome.length < 2 || !/^[a-zA-ZàèéìòùÀÈÉÌÒÙ'\s-]+$/.test(cognome)) errors.push('Cognome non valido');
  if (!numero_telefono || !/^\d{8,15}$/.test(numero_telefono)) errors.push('Numero di telefono non valido');
  if (!nickname || nickname.length < 3) errors.push('Nickname troppo corto');
  if (!password || password.length < 6) errors.push('Password troppo corta (min 6 caratteri)');
  if (ruolo === 'pr' && (percentuale_provvigione === undefined || isNaN(percentuale_provvigione) || percentuale_provvigione < 0 || percentuale_provvigione > 100)) errors.push('Percentuale provvigione non valida');
  
  if (errors.length > 0) {
    req.flash('error', 'Errore inserimento utente: ' + errors.join(', '));
    return res.redirect('/admin/nuovo-utente');
  }
  
  // Gli admin possono creare altri admin, pre-admin e PR
  // [PRODUCTION] Removed console.log(`[CREAZIONE UTENTE] Admin ${req.session.user.nickname} crea ${ruolo} sotto padre_id ${padre_id} - AUTORIZZATO`)
  
  // Validazione padre_id con controlli di sicurezza
  validateAndConvertPadreId(padre_id, ruolo, (errPadre, padreIdValidato) => {
    if (errPadre) {
      req.flash('error', 'Errore validazione padre: ' + errPadre.message);
      return res.redirect('/admin/nuovo-utente');
    }

    // Genera ID univoco per il nuovo utente
    generateUniqueId(ruolo, (errId, newUserId) => {
      if (errId) {
        req.flash('error', 'Errore generazione ID: ' + errId.message);
        return res.redirect('/admin/nuovo-utente');
      }

      // Hash della password
      bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
          req.flash('error', 'Errore hash password');
          return res.redirect('/admin/nuovo-utente');
        }
        
        // Prepara i dati dell'utente per la crittografia automatica
        const userData = {
          id: newUserId,
          nome,
          cognome,
          numero_telefono,
          nickname,
          password: hash
        };

        if (ruolo === 'admin') {
          insertUser('admin', userData, (err, result) => {
            if (err) {
              req.flash('error', 'Errore inserimento admin: ' + err.message);
              return res.redirect('/admin/nuovo-utente');
            }
            // [PRODUCTION] Removed console.log(`[CREAZIONE] Admin creato con ID univoco: ${newUserId} (pagina dedicata, dati crittografati)`);
            req.flash('success', `Admin ${nickname} creato con successo!`);
            res.redirect('/admin/staff');
          });
        } else if (ruolo === 'pre_admin') {
          userData.fk_admin = padreIdValidato;
          insertUser('pre_admin', userData, (err, result) => {
            if (err) {
              req.flash('error', 'Errore inserimento pre_admin: ' + err.message);
              return res.redirect('/admin/nuovo-utente');
            }
            // [PRODUCTION] Removed console.log(`[CREAZIONE] Pre_admin creato con ID univoco: ${newUserId}, padre: ${padreIdValidato} (pagina dedicata, dati crittografati)`);
            req.flash('success', `Pre-Admin ${nickname} creato con successo!`);
            res.redirect('/admin/staff');
          });
        } else if (ruolo === 'pr') {
          userData.fk_padre = padreIdValidato;
          userData.percentuale_provvigione = percentuale_provvigione || 0;
          userData.poteri = poteri ? 1 : 0;
          insertUser('pr', userData, (err, result) => {
            if (err) {
              req.flash('error', 'Errore inserimento PR: ' + err.message);
              return res.redirect('/admin/nuovo-utente');
            }
            // [PRODUCTION] Removed console.log(`[CREAZIONE] PR creato con ID univoco: ${newUserId}, padre: ${padreIdValidato} (pagina dedicata, dati crittografati)`);
            req.flash('success', `PR ${nickname} creato con successo!`);
            res.redirect('/admin/staff');
          });
        } else {
          req.flash('error', 'Ruolo non valido');
          res.redirect('/admin/nuovo-utente');
        }
      });
    });
  });
});

// Debug filtri admin - mostra informazioni sui filtri applicati
router.get('/debug-filters', isAdmin, addAdminFilter, async (req, res) => {
  try {
    // [PRODUCTION] Removed console.log(`[DEBUG FILTERS] Admin ${req.session.user.nickname} accede al debug dei filtri`)
    
    // Ottieni informazioni complete sull'admin
    const adminInfo = req.session.user;
    
    // Ottieni la gerarchia completa
    const hierarchy = await getPRHierarchy(req.session.user.id);
    
    // Ottieni il filtro admin
    const adminFilter = req.adminFilter;
    
    // Ottieni la query filtrata
    const filteredQuery = await getFilteredStaffQuery(req.session.user.id);
    
    // Esegui la query per ottenere gli utenti visibili
    const { decryptUserArray } = require('../utils/crypto');
    
    db.all(filteredQuery, [], (err, users) => {
      if (err) {
        console.error('[DEBUG FILTERS] Errore query utenti visibili:', err);
        return res.status(500).send('Errore nel recupero dati');
      }
      
      // Decripta i dati
      const visibleUsers = decryptUserArray(users);
      
      res.render('admin/debug-filters', {
        layout: 'admin/layout-new',
        title: 'Debug Filtri Admin - ICONIC',
        currentPage: 'debug',
        currentAdmin: adminInfo.nickname,
        adminInfo,
        hierarchy,
        adminFilter,
        filteredQuery,
        visibleUsers
      });
    });
    
  } catch (error) {
    console.error('[DEBUG FILTERS] Errore generale:', error);
    res.status(500).send('Errore interno del server');
  }
});

// ===========================================
// GESTIONE DATABASE COMPLETA
// ===========================================

// Pagina principale gestione database
router.get('/database', isAdmin, addAdminFilter, async (req, res) => {
  // [PRODUCTION] Removed console.log(`[DATABASE] Admin ${req.session.user.nickname} (ID: ${req.session.user.id}) carica database della sua gerarchia`);
  
  try {
    let allResults = {};
    let completed = 0;
    const total = 5; // admin, pre_admin, pr, richieste, storico
    
    // Carica TUTTI i dati (non filtrati inizialmente)
    getAllUsers('admin', (err, adminUsers) => {
      if (err) {
        console.error(`[DATABASE] Errore query admin:`, err.message);
        allResults.admin = [];
      } else {
        // Rimuovi le password per sicurezza
        allResults.admin = adminUsers.map(user => {
          const { password, ...userWithoutPassword } = user;
          return userWithoutPassword;
        });
      }
      completed++;
      checkCompletion();
    });
    
    getAllUsers('pre_admin', (err, preAdminUsers) => {
      if (err) {
        console.error(`[DATABASE] Errore query pre_admin:`, err.message);
        allResults.pre_admin = [];
      } else {
        // Rimuovi le password per sicurezza
        allResults.pre_admin = preAdminUsers.map(user => {
          const { password, ...userWithoutPassword } = user;
          return userWithoutPassword;
        });
      }
      completed++;
      checkCompletion();
    });
    
    getAllUsers('pr', (err, prUsers) => {
      if (err) {
        console.error(`[DATABASE] Errore query pr:`, err.message);
        allResults.pr = [];
      } else {
        // Rimuovi le password per sicurezza
        allResults.pr = prUsers.map(user => {
          const { password, ...userWithoutPassword } = user;
          return userWithoutPassword;
        });
      }
      completed++;
      checkCompletion();
    });
    
    // Per le altre tabelle, usa query normali
    db.all('SELECT * FROM richieste_tavoli ORDER BY data DESC', [], (err, rows) => {
      if (err) {
        console.error(`[DATABASE] Errore query richieste:`, err.message);
        allResults.richieste_tavoli = [];
      } else {
        allResults.richieste_tavoli = rows;
      }
      completed++;
      checkCompletion();
    });
    
    db.all('SELECT * FROM storico_tavoli ORDER BY data DESC', [], (err, rows) => {
      if (err) {
        console.error(`[DATABASE] Errore query storico:`, err.message);
        allResults.storico_tavoli = [];
      } else {
        allResults.storico_tavoli = rows;
      }
      completed++;
      checkCompletion();
    });
    
    async function checkCompletion() {
      if (completed === total) {
        try {
          // Applica filtri per l'admin corrente
          const filteredResults = await filterDatabaseDataForAdmin(req.session.user.id, allResults);
          
          // Calcola statistiche filtrate
          const dbStats = {
            admin: filteredResults.admin.length,
            pre_admin: filteredResults.pre_admin.length, 
            pr: filteredResults.pr.length,
            richieste: filteredResults.richieste_tavoli.length,
            storico: filteredResults.storico_tavoli.length
          };
          
          // [PRODUCTION] Removed console.log(`[DATABASE] Admin ${req.session.user.nickname} può vedere:`, dbStats)
          
          res.render('admin/database', {
            layout: 'admin/layout-new',
            title: 'ICONIC - Database',
            currentPage: 'database',
            dbStats,
            adminData: filteredResults.admin,
            preAdminData: filteredResults.pre_admin,
            prData: filteredResults.pr,
            richiesteData: filteredResults.richieste_tavoli,
            storicoData: filteredResults.storico_tavoli,
            adminFilter: req.adminFilter
          });
          
        } catch (filterError) {
          console.error('[DATABASE] Errore filtro dati:', filterError);
          res.status(500).send('Errore filtro dati database');
        }
      }
    }
    
  } catch (error) {
    console.error('[DATABASE] Errore generale:', error);
    res.status(500).send('Errore interno del server');
  }
});// API per ottenere singolo record
router.get('/database/:table/:id', isAdmin, (req, res) => {
  const { table, id } = req.params;
  
  // Validazione tabella
  const allowedTables = ['admin', 'pre_admin', 'pr', 'richieste_tavoli', 'storico_tavoli'];
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Tabella non valida' });
  }
  
  // Validazione ID
  const recordId = parseInt(id);
  if (isNaN(recordId)) {
    return res.status(400).json({ error: 'ID non valido' });
  }

  // Per le tabelle utente, usa la funzione con decrittografia automatica
  if (['admin', 'pre_admin', 'pr'].includes(table)) {
    getUserById(table, recordId, (err, user) => {
      if (err) {
        console.error(`[DATABASE] Errore get user:`, err.message);
        return res.status(500).json({ error: err.message });
      }
      
      if (!user) {
        return res.status(404).json({ error: 'Record non trovato' });
      }
      
      // Rimuovi la password dalla risposta per sicurezza
      delete user.password;
      res.json(user);
    });
  } else {
    // Per le altre tabelle, usa la query normale
    db.get(`SELECT * FROM ${table} WHERE id = ?`, [recordId], (err, row) => {
      if (err) {
        console.error(`[DATABASE] Errore get record:`, err.message);
        return res.status(500).json({ error: err.message });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'Record non trovato' });
      }
      
      res.json(row);
    });
  }
});

// API per creare nuovo record
router.post('/database/:table', isAdmin, (req, res) => {
  const { table } = req.params;
  const data = req.body;
  
  // Validazione tabella
  const allowedTables = ['admin', 'pre_admin', 'pr', 'richieste_tavoli', 'storico_tavoli'];
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Tabella non valida' });
  }
  
  // [PRODUCTION] Removed console.log(`[DATABASE] Creazione record in ${table}:`, data)
  
  // Genera ID univoco se necessario
  if (['admin', 'pre_admin', 'pr'].includes(table)) {
    const ruolo = table === 'admin' ? 'admin' : table === 'pre_admin' ? 'pre_admin' : 'pr';
    generateUniqueId(ruolo, (errId, newId) => {
      if (errId) {
        return res.status(500).json({ error: 'Errore generazione ID: ' + errId.message });
      }
      
      data.id = newId;
      createRecord(table, data, res);
    });
  } else {
    // Per richieste_tavoli e storico_tavoli usa autoincrement
    createRecord(table, data, res);
  }
});

function createRecord(table, data, res) {
  // Hash password se presente
  if (data.password && ['admin', 'pre_admin', 'pr'].includes(table)) {
    bcrypt.hash(data.password, 10, (err, hash) => {
      if (err) {
        return res.status(500).json({ error: 'Errore hash password' });
      }
      data.password = hash;
      insertRecord(table, data, res);
    });
  } else {
    insertRecord(table, data, res);
  }
}

function insertRecord(table, data, res) {
  let query, values;
  
  switch (table) {
    case 'admin':
      query = 'INSERT INTO admin (id, nickname, nome, cognome, numero_telefono, password) VALUES (?, ?, ?, ?, ?, ?)';
      values = [data.id, data.nickname, data.nome, data.cognome, data.numero_telefono, data.password];
      break;
      
    case 'pre_admin':
      query = 'INSERT INTO pre_admin (id, nickname, nome, cognome, numero_telefono, password, fk_admin) VALUES (?, ?, ?, ?, ?, ?, ?)';
      values = [data.id, data.nickname, data.nome, data.cognome, data.numero_telefono, data.password, data.fk_admin || null];
      break;
      
    case 'pr':
      query = `INSERT INTO pr (id, nickname, nome, cognome, numero_telefono, password, fk_padre, poteri, 
               percentuale_provvigione, provvigioni_da_pagare, tot_persone_portate, tot_spesa_tavolo) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      values = [data.id, data.nickname, data.nome, data.cognome, data.numero_telefono, data.password, 
                data.fk_padre || null, data.poteri || 0, data.percentuale_provvigione || 10,
                data.provvigioni_da_pagare || 0, data.tot_persone_portate || 0, data.tot_spesa_tavolo || 0];
      break;
      
    case 'richieste_tavoli':
      query = `INSERT INTO richieste_tavoli (pr_id, data, nome_tavolo, numero_persone, spesa_prevista, omaggi, note_tavolo, stato) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      values = [data.pr_id, data.data, data.nome_tavolo, data.numero_persone, data.spesa_prevista, 
                data.omaggi || null, data.note_tavolo || null, data.stato || 'in attesa'];
      break;
      
    case 'storico_tavoli':
      query = `INSERT INTO storico_tavoli (pr_id, data, nome_tavolo, numero_persone, spesa_prevista, omaggi, note_tavolo) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
      values = [data.pr_id, data.data, data.nome_tavolo, data.numero_persone, data.spesa_prevista, 
                data.omaggi || null, data.note_tavolo || null];
      break;
      
    default:
      return res.status(400).json({ error: 'Tabella non supportata' });
  }
  
  db.run(query, values, function(err) {
    if (err) {
      console.error(`[DATABASE] Errore inserimento in ${table}:`, err.message);
      return res.status(500).json({ error: err.message });
    }
    
    // [PRODUCTION] Removed console.log(`[DATABASE] Record creato in ${table}, ID: ${this.lastID || data.id}`)
    res.json({ success: true, id: this.lastID || data.id });
  });
}

// API per aggiornare record
router.put('/database/:table/:id', isAdmin, (req, res) => {
  const { table, id } = req.params;
  const data = req.body;
  
  // Validazione
  const allowedTables = ['admin', 'pre_admin', 'pr', 'richieste_tavoli', 'storico_tavoli'];
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Tabella non valida' });
  }
  
  const recordId = parseInt(id);
  if (isNaN(recordId)) {
    return res.status(400).json({ error: 'ID non valido' });
  }
  
  // [PRODUCTION] Removed console.log(`[DATABASE] Aggiornamento record ${table} ID ${recordId}:`, data)
  
  // CONTROLLO SICUREZZA: Se si sta modificando un admin via API, deve essere se stesso
  if (table === 'admin' && recordId !== req.session.user.id) {
    // [PRODUCTION] Removed console.log(`[SICUREZZA API] Admin ${req.session.user.nickname} (ID: ${req.session.user.id}) ha tentato di modificare admin ID ${recordId} via API - BLOCCATO`);
    return res.status(403).json({ error: 'Non puoi modificare altri amministratori via API. Puoi modificare solo i tuoi dati.' });
  }
  
  // Hash password se presente e modificata
  if (data.password && ['admin', 'pre_admin', 'pr'].includes(table)) {
    bcrypt.hash(data.password, 10, (err, hash) => {
      if (err) {
        return res.status(500).json({ error: 'Errore hash password' });
      }
      data.password = hash;
      updateRecord(table, recordId, data, res);
    });
  } else {
    updateRecord(table, recordId, data, res);
  }
});

function updateRecord(table, id, data, res) {
  // Per le tabelle utente, usa la funzione di aggiornamento con crittografia automatica
  if (['admin', 'pre_admin', 'pr'].includes(table)) {
    updateUser(table, id, data, (err, result) => {
      if (err) {
        console.error(`[DATABASE] Errore aggiornamento ${table} ID ${id}:`, err.message);
        return res.status(500).json({ error: err.message });
      }
      
      if (result && result.changes === 0) {
        return res.status(404).json({ error: 'Record non trovato' });
      }
      
      // [PRODUCTION] Removed console.log(`[DATABASE] Record aggiornato con crittografia: ${table} ID ${id}`)
      res.json({ success: true });
    });
    return;
  }
  
  // Per le altre tabelle, usa la logica originale
  let query, values;
  
  switch (table) {
    case 'richieste_tavoli':
      query = `UPDATE richieste_tavoli SET pr_id=?, data=?, nome_tavolo=?, numero_persone=?, spesa_prevista=?, omaggi=?, note_tavolo=?, stato=? WHERE id=?`;
      values = [data.pr_id, data.data, data.nome_tavolo, data.numero_persone, data.spesa_prevista, 
                data.omaggi || null, data.note_tavolo || null, data.stato || 'in attesa', id];
      break;
      
    case 'storico_tavoli':
      query = `UPDATE storico_tavoli SET pr_id=?, data=?, nome_tavolo=?, numero_persone=?, spesa_prevista=?, omaggi=?, note_tavolo=? WHERE id=?`;
      values = [data.pr_id, data.data, data.nome_tavolo, data.numero_persone, data.spesa_prevista, 
                data.omaggi || null, data.note_tavolo || null, id];
      break;
      
    default:
      return res.status(400).json({ error: 'Tabella non supportata' });
  }
  
  db.run(query, values, function(err) {
    if (err) {
      console.error(`[DATABASE] Errore aggiornamento ${table} ID ${id}:`, err.message);
      return res.status(500).json({ error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Record non trovato' });
    }
    
    // [PRODUCTION] Removed console.log(`[DATABASE] Record aggiornato: ${table} ID ${id}`)
    res.json({ success: true });
  });
}

// API per eliminare record
router.delete('/database/:table/:id', isAdmin, (req, res) => {
  const { table, id } = req.params;
  
  // Validazione
  const allowedTables = ['admin', 'pre_admin', 'pr', 'richieste_tavoli', 'storico_tavoli'];
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Tabella non valida' });
  }
  
  const recordId = parseInt(id);
  if (isNaN(recordId)) {
    return res.status(400).json({ error: 'ID non valido' });
  }
  
  // [PRODUCTION] Removed console.log(`[DATABASE] Eliminazione record ${table} ID ${recordId}`)
  
  let deleteQuery = `DELETE FROM ${table} WHERE id = ?`;
  let softDeleted = false;
  if (table === 'pr') {
    deleteQuery = `UPDATE pr SET attivo = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`;
    softDeleted = true;
  }
  db.run(deleteQuery, [recordId], function(err) {
    if (err) {
      console.error(`[DATABASE] Errore eliminazione ${table} ID ${recordId}:`, err.message);
      return res.status(500).json({ error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Record non trovato' });
    }
    
    // [PRODUCTION] Removed console.log(`[DATABASE] Record eliminato: ${table} ID ${recordId}`)
    res.json({ success: true, softDeleted });
  });
});

// Gestione Richieste PR con filtro gerarchia
router.get('/richieste-pr', isAdmin, addAdminFilter, async (req, res) => {
  // [PRODUCTION] Removed console.log(`[RICHIESTE PR] Admin ${req.session.user.nickname} (ID: ${req.session.user.id}) carica richieste PR della sua gerarchia`);
  
  try {
    const filter = req.adminFilter;
    
    if (filter.prIds.length === 0) {
      // [PRODUCTION] Removed console.log(`[RICHIESTE PR] Admin ${req.session.user.nickname} non ha PR nella sua gerarchia`)
      return res.render('admin/richieste-pr', {
        layout: 'admin/layout-new',
        title: 'ICONIC - Richieste PR',
        currentPage: 'richieste-pr',
        richieste: [],
        tuttiPR: [],
        stats: {
          totali: 0,
          inAttesa: 0,
          approvate: 0,
          rifiutate: 0
        },
        adminFilter: filter
      });
    }
    
    // Query filtrata per le richieste PR dei PR nella gerarchia dell'admin
    const query = `
      SELECT 
        r.*,
        richiedente.nickname as richiedente_nickname,
        richiedente.nome as richiedente_nome,
        richiedente.cognome as richiedente_cognome,
        padre_proposto.nickname as padre_nickname,
        padre_proposto.nome as padre_nome,
        padre_proposto.cognome as padre_cognome
      FROM richieste_creazione_pr r
      LEFT JOIN pr richiedente ON r.fk_richiedente = richiedente.id
      LEFT JOIN pr padre_proposto ON r.fk_padre_proposto = padre_proposto.id
      WHERE r.fk_richiedente IN (${filter.prIds.join(',')})
      ORDER BY r.data_richiesta DESC
    `;
  
    db.all(query, [], (err, richieste) => {
      if (err) {
        console.error('[RICHIESTE PR] Errore recupero richieste PR:', err.message);
        return res.status(500).send('Errore nel recupero delle richieste');
      }
      
      // [PRODUCTION] Removed console.log(`[RICHIESTE PR] Admin ${req.session.user.nickname} può vedere ${richieste.length} richieste PR`)
      
      // Decritta i dati per la visualizzazione
      const richiesteDecrypted = richieste.map(richiesta => {
        if (richiesta.richiedente_nome) {
          const decryptedRichiedente = decryptUserData({
            nome: richiesta.richiedente_nome,
            cognome: richiesta.richiedente_cognome
          });
          richiesta.richiedente_nome = decryptedRichiedente.nome;
          richiesta.richiedente_cognome = decryptedRichiedente.cognome;
        }
        
        if (richiesta.padre_nome) {
          const decryptedPadre = decryptUserData({
            nome: richiesta.padre_nome,
            cognome: richiesta.padre_cognome
          });
          richiesta.padre_nome = decryptedPadre.nome;
          richiesta.padre_cognome = decryptedPadre.cognome;
        }
        
        // Decripta anche i dati della richiesta
        const decryptedRichiesta = decryptUserData({
          nome: richiesta.nome,
          cognome: richiesta.cognome,
          telefono: richiesta.numero_telefono
        });
        richiesta.nome = decryptedRichiesta.nome;
        richiesta.cognome = decryptedRichiesta.cognome;
        richiesta.numero_telefono = decryptedRichiesta.telefono;
        
        return richiesta;
      });
      
      // Query per tutti i PR della gerarchia (per il select nel modal)
      const tuttiPRQuery = `SELECT id, nickname FROM pr WHERE id IN (${filter.prIds.join(',')}) ORDER BY nickname`;
      
      db.all(tuttiPRQuery, [], (err2, tuttiPR) => {
        if (err2) {
          console.error('[RICHIESTE PR] Errore recupero PR:', err2.message);
          return res.status(500).send('Errore nel recupero dei PR');
        }
        
        // Query per le statistiche filtrate
        const statsQuery = `
          SELECT 
            COUNT(*) as totali,
            COUNT(CASE WHEN stato = 'in attesa' THEN 1 END) as in_attesa,
            COUNT(CASE WHEN stato = 'approvata' THEN 1 END) as approvate,
            COUNT(CASE WHEN stato = 'rifiutata' THEN 1 END) as rifiutate
          FROM richieste_creazione_pr
          WHERE fk_richiedente IN (${filter.prIds.join(',')})
        `;
        
        db.get(statsQuery, [], (err3, statsRaw) => {
          if (err3) {
            console.error('[RICHIESTE PR] Errore recupero statistiche:', err3.message);
            return res.status(500).send('Errore nel recupero delle statistiche');
          }
          
          const stats = {
            totali: statsRaw.totali || 0,
            inAttesa: statsRaw.in_attesa || 0,
            approvate: statsRaw.approvate || 0,
            rifiutate: statsRaw.rifiutate || 0
          };
          
          res.render('admin/richieste-pr', { 
            layout: 'admin/layout-new',
            title: 'ICONIC - Richieste PR',
            currentPage: 'richieste-pr',
            richieste: richiesteDecrypted,
            tuttiPR: tuttiPR,
            stats: stats,
            adminFilter: filter
          });
        });
      });
    });
    
  } catch (error) {
    console.error('[RICHIESTE PR] Errore filtro admin:', error);
    res.status(500).send('Errore interno del server');
  }
});

// Approva richiesta PR
router.post('/richieste-pr/:id/approva', isAdmin, async (req, res) => {
  const richiestaId = req.params.id;
  const { 
    nickname, 
    nome, 
    cognome, 
    numero_telefono, 
    percentuale_provvigione, 
    padre_proposto_id, 
    note_admin 
  } = req.body;
  
  try {
    // Recupera la richiesta per ottenere la password originale e verificare lo stato
    const richiesta = await new Promise((resolve, reject) => {
      db.get('SELECT password, stato FROM richieste_creazione_pr WHERE id = ?', [richiestaId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!richiesta) {
      return res.redirect('/admin/richieste-pr?error=notfound');
    }
    
    if (richiesta.stato !== 'in attesa') {
      return res.redirect('/admin/richieste-pr?error=already_managed');
    }
    
    // Crea l'hash della password
    const hashedPassword = await bcrypt.hash(richiesta.password, 10);
    
    // Inizia transazione
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Inserisci il nuovo PR
      const insertPrQuery = `
        INSERT INTO pr (nickname, nome, cognome, numero_telefono, password, percentuale_provvigione, fk_padre, poteri)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `;
      
      db.run(insertPrQuery, [
        nickname,           // Dal form dell'admin
        nome,              // Dal form dell'admin
        cognome,           // Dal form dell'admin
        numero_telefono,   // Dal form dell'admin
        hashedPassword,    // Password originale (hashata)
        percentuale_provvigione, // Dal form dell'admin
        padre_proposto_id  // Dal form dell'admin (sarà fk_padre nel DB)
      ], function(err) {
        if (err) {
          console.error('[ADMIN] Errore creazione PR:', err.message);
          db.run('ROLLBACK');
          return res.redirect('/admin/richieste-pr?error=creation_failed');
        }
        
        // Aggiorna lo stato della richiesta
        db.run(
          'UPDATE richieste_creazione_pr SET stato = ?, note_admin = ?, data_risposta = CURRENT_TIMESTAMP WHERE id = ?',
          ['approvata', note_admin || '', richiestaId],
          function(updateErr) {
            if (updateErr) {
              console.error('[ADMIN] Errore aggiornamento richiesta:', updateErr.message);
              db.run('ROLLBACK');
              return res.redirect('/admin/richieste-pr?error=update_failed');
            }
            
            db.run('COMMIT');
            // [PRODUCTION] Removed console.log(`[ADMIN] PR creato con successo: ${richiesta.nickname}`)
            res.redirect('/admin/richieste-pr?success=1');
          }
        );
      });
    });
    
  } catch (error) {
    console.error('[ADMIN] Errore approvazione richiesta:', error.message);
    res.redirect('/admin/richieste-pr?error=server_error');
  }
});

// Rifiuta richiesta PR
router.post('/richieste-pr/:id/rifiuta', isAdmin, (req, res) => {
  const richiestaId = req.params.id;
  const { note_admin } = req.body;
  
  // Verifica che la richiesta esista e sia in attesa
  db.get('SELECT stato FROM richieste_creazione_pr WHERE id = ?', [richiestaId], (err, richiesta) => {
    if (err) {
      console.error('[ADMIN] Errore verifica richiesta:', err.message);
      return res.redirect('/admin/richieste-pr?error=db_error');
    }
    
    if (!richiesta) {
      return res.redirect('/admin/richieste-pr?error=notfound');
    }
    
    if (richiesta.stato !== 'in attesa') {
      return res.redirect('/admin/richieste-pr?error=already_managed');
    }
    
    // Aggiorna lo stato della richiesta
    db.run(
      'UPDATE richieste_creazione_pr SET stato = ?, note_admin = ?, data_risposta = CURRENT_TIMESTAMP WHERE id = ?',
      ['rifiutata', note_admin || '', richiestaId],
      function(updateErr) {
        if (updateErr) {
          console.error('[ADMIN] Errore rifiuto richiesta:', updateErr.message);
          return res.redirect('/admin/richieste-pr?error=update_failed');
        }
        
        // [PRODUCTION] Removed console.log(`[ADMIN] Richiesta rifiutata: ID ${richiestaId}`)
        res.redirect('/admin/richieste-pr?success=2');
      }
    );
  });
});

// Middleware per admin con controllo poteri
function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.ruolo === 'admin') {
    return next();
  }
  return res.redirect('/login');
}

router.post('/approva-tavolo/:id', ensureAdmin, (req, res) => {
  const tavoloId = req.params.id;
  const { note_admin } = req.body;
  
  // Prima ottieni i dati della richiesta
  db.get('SELECT * FROM richieste_tavoli WHERE id = ?', [tavoloId], (err, richiesta) => {
    if (err || !richiesta) {
      return res.status(404).json({ success: false, message: 'Richiesta non trovata' });
    }
    
    if (richiesta.stato !== 'in attesa') {
      return res.status(400).json({ success: false, message: 'Richiesta già processata' });
    }
    
    // Ottieni la percentuale provvigione del PR per calcolo accurato
    db.get('SELECT percentuale_provvigione FROM pr WHERE id = ?', [richiesta.pr_id], (errPr, prInfo) => {
      if (errPr) {
        return res.status(500).json({ success: false, message: 'Errore lettura dati PR' });
      }
      
      const percentualeProvvigione = prInfo ? prInfo.percentuale_provvigione : 10;
      const provvigioneTavolo = richiesta.spesa_prevista * (percentualeProvvigione / 100);
      
      // Inizia transazione per aggiornare richiesta e creare storico
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Aggiorna stato richiesta
        db.run(`UPDATE richieste_tavoli 
                SET stato = 'approvato', 
                    data_approvazione = CURRENT_TIMESTAMP,
                    note_admin = ?
                WHERE id = ?`, 
          [note_admin || '', tavoloId], function(err1) {
            if (err1) {
              db.run('ROLLBACK');
              return res.status(500).json({ success: false, message: 'Errore aggiornamento richiesta' });
            }
            
            // Inserisci nel storico tavoli
            db.run(`INSERT INTO storico_tavoli 
                    (pr_id, data, numero_persone, spesa_prevista, nome_tavolo, omaggi, note_tavolo, stato)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'confermato')`,
              [richiesta.pr_id, richiesta.data, richiesta.numero_persone, 
               richiesta.spesa_prevista, richiesta.nome_tavolo, richiesta.omaggi, richiesta.note_tavolo],
              function(err2) {
                if (err2) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ success: false, message: 'Errore creazione storico' });
                }
                
                // Aggiorna statistiche PR (mantenendo compatibilità con il campo legacy)
                db.run(`UPDATE pr SET 
                          tot_spesa_tavolo = COALESCE(tot_spesa_tavolo, 0) + ?,
                          tot_persone_portate = COALESCE(tot_persone_portate, 0) + ?
                        WHERE id = ?`,
                  [richiesta.spesa_prevista, richiesta.numero_persone, richiesta.pr_id],
                  function(err3) {
                    if (err3) {
                      db.run('ROLLBACK');
                      return res.status(500).json({ success: false, message: 'Errore aggiornamento statistiche' });
                    }
                    
                    db.run('COMMIT');
                    // [PRODUCTION] Removed console.log(`[ADMIN] Tavolo ${tavoloId} approvato per PR ${richiesta.pr_id}, provvigione: €${provvigioneTavolo.toFixed(2)}, aggiornate statistiche`);
                    res.json({ 
                      success: true, 
                      message: 'Tavolo approvato con successo',
                      provvigione_calcolata: provvigioneTavolo
                    });
                  });
              });
          });
      });
    });
  });
});

// Rifiuto richiesta tavolo con aggiornamento stato
router.post('/rifiuta-tavolo/:id', ensureAdmin, (req, res) => {
  const tavoloId = req.params.id;
  const { note_admin } = req.body;
  
  db.run(`UPDATE richieste_tavoli 
          SET stato = 'rifiutato', 
              data_approvazione = CURRENT_TIMESTAMP,
              note_admin = ?
          WHERE id = ? AND stato = 'in attesa'`, 
    [note_admin || '', tavoloId], function(err) {
      if (err) {
        return res.status(500).json({ success: false, message: 'Errore aggiornamento richiesta' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: 'Richiesta non trovata o già processata' });
      }
      
      // [PRODUCTION] Removed console.log(`[ADMIN] Tavolo ${tavoloId} rifiutato`)
      res.json({ success: true, message: 'Richiesta rifiutata' });
    });
});

// Gestione pagamenti provvigioni dall'admin
router.post('/paga-provvigioni', ensureAdmin, async (req, res) => {
  const { pr_id, importo, note } = req.body;
  
  try {
    // Verifica che il PR esista
    db.get('SELECT id, nickname, fk_padre FROM pr WHERE id = ?', [pr_id], async (err, pr) => {
      if (err || !pr) {
        return res.status(404).json({ success: false, message: 'PR non trovato' });
      }
      
      // Verifica che il PR sia idoneo per il pagamento admin
      const hasChildren = await new Promise((resolve) => {
        db.get('SELECT COUNT(*) as count FROM pr WHERE fk_padre = ?', [pr_id], (err, result) => {
          resolve(err ? false : result.count > 0);
        });
      });
      
      // L'admin può pagare solo PR senza padre o PR senza figli
      if (pr.fk_padre && hasChildren) {
        return res.status(400).json({ 
          success: false, 
          message: 'Questo PR deve essere pagato dal suo padre, non dall\'admin' 
        });
      }
      
      const importoNumerico = parseFloat(importo);
      if (isNaN(importoNumerico) || importoNumerico <= 0) {
        return res.status(400).json({ success: false, message: 'Importo non valido' });
      }
      
      // Registra il pagamento (pr_pagante_id = null per admin)
      const pagamentoId = await registraPagamentoProvvigioni(
        pr_id, 
        null, // null = pagamento da admin
        importoNumerico, 
        note || ''
      );
      
      // [PRODUCTION] Removed console.log(`[ADMIN PAGAMENTO] Admin ha pagato €${importoNumerico} a PR ${pr_id} (${pr.nickname})`);
      
      res.json({ 
        success: true, 
        message: `Pagamento di €${importoNumerico} registrato per ${pr.nickname}`,
        pagamento_id: pagamentoId
      });
    });
    
  } catch (error) {
    console.error('[ADMIN PAGAMENTO] Errore:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel registrare il pagamento' 
    });
  }
});

// Visualizzazione e gestione pagamenti provvigioni
router.get('/pagamenti-provvigioni', ensureAdmin, (req, res) => {
  // Query per tutti i PR con le loro provvigioni
  const provvigioniQuery = `
    SELECT 
      p.id,
      p.nickname,
      p.nome,
      p.cognome,
      p.fk_padre,
      padre.nickname as padre_nickname,
      COALESCE(SUM(st.spesa_prevista * p.percentuale_provvigione / 100), 0) as provvigioni_maturate,
      COALESCE(p.provvigioni_totali_pagate, 0) as provvigioni_pagate,
      (COALESCE(SUM(st.spesa_prevista * p.percentuale_provvigione / 100), 0) - COALESCE(p.provvigioni_totali_pagate, 0)) as provvigioni_da_pagare,
      p.ultima_data_pagamento,
      CASE 
        WHEN EXISTS(SELECT 1 FROM pr pr2 WHERE pr2.fk_padre = p.id) THEN 1 
        ELSE 0 
      END as ha_figli,
      CASE 
        WHEN p.fk_padre IS NULL THEN 'admin'
        WHEN NOT EXISTS(SELECT 1 FROM pr pr2 WHERE pr2.fk_padre = p.id) THEN 'admin'
        ELSE 'padre'
      END as pagante_tipo
    FROM pr p
    LEFT JOIN pr padre ON p.fk_padre = padre.id
    LEFT JOIN storico_tavoli st ON p.id = st.pr_id
    GROUP BY p.id, p.nickname, p.nome, p.cognome, p.fk_padre, padre.nickname
    HAVING provvigioni_da_pagare > 0
    ORDER BY provvigioni_da_pagare DESC
  `;
  
  db.all(provvigioniQuery, [], (err, provvigioni) => {
    if (err) {
      console.error('[ADMIN PROVVIGIONI] Errore query:', err);
      return res.status(500).send('Errore caricamento provvigioni');
    }
    
    // Filtra solo quelli che devono essere pagati dall'admin
    const provvigioniAdmin = provvigioni.filter(p => p.pagante_tipo === 'admin');
    
    res.render('admin/pagamenti-provvigioni', { 
      provvigioni: provvigioniAdmin,
      tutti_pr: provvigioni, // per debugging
      user: req.session.user 
    });
  });
});
// Gestione pagamenti provvigioni dall'admin
router.post('/paga-provvigioni-admin', ensureAdmin, async (req, res) => {
  const { pr_id, importo, note } = req.body;
  
  try {
    db.get('SELECT id, nickname, fk_padre FROM pr WHERE id = ?', [pr_id], async (err, pr) => {
      if (err || !pr) {
        return res.status(404).json({ success: false, message: 'PR non trovato' });
      }
      
      const importoNumerico = parseFloat(importo);
      if (isNaN(importoNumerico) || importoNumerico <= 0) {
        return res.status(400).json({ success: false, message: 'Importo non valido' });
      }
      
      const pagamentoId = await registraPagamentoProvvigioni(
        pr_id, 
        null, // null = pagamento da admin
        importoNumerico, 
        note || ''
      );
      
      // [PRODUCTION] Removed console.log(`[ADMIN PAGAMENTO] Admin ha pagato €${importoNumerico} a PR ${pr_id} (${pr.nickname})`);
      
      res.json({ 
        success: true, 
        message: `Pagamento di €${importoNumerico} registrato per ${pr.nickname}`,
        pagamento_id: pagamentoId
      });
    });
  } catch (error) {
    console.error('[ADMIN PAGAMENTO] Errore:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel registrare il pagamento' 
    });
  }
});

// Pagina Guadagni - visualizza i ricavi dell'admin
router.get('/guadagni', isAdmin, addAdminFilter, async (req, res) => {
  // [PRODUCTION] Removed console.log(`[ADMIN GUADAGNI] Admin ${req.session.user.nickname} (ID: ${req.session.user.id}) accede alla pagina guadagni della sua gerarchia`);
  
  try {
    const filter = req.adminFilter;
    
    if (filter.prIds.length === 0) {
      // [PRODUCTION] Removed console.log(`[ADMIN GUADAGNI] Admin ${req.session.user.nickname} non ha PR nella sua gerarchia`)
      return res.render('admin/guadagni', {
        layout: 'admin/layout-new',
        title: 'ICONIC - Guadagni Admin',
        currentPage: 'guadagni',
        prGuadagni: [],
        totali: {
          fatturatoTotale: 0,
          guadagnoLordoTotale: 0,
          detrazioniTotali: { passo: 0, cassa: 0, cuzzo: 0, totale: 0 },
          guadagnoNettoTotale: 0,
          numeroPR: 0,
          numeroEventiTotali: 0
        },
        adminFilter: filter
      });
    }
    
    // Query per ottenere TUTTI i PR della gerarchia dell'admin con i loro dati
    const query = `
      SELECT 
        pr.id,
        pr.nickname,
        pr.nome,
        pr.cognome,
        pr.percentuale_provvigione,
        pr.tot_spesa_tavolo,
        pr.fk_padre,
        CASE 
          WHEN pr.fk_padre = ? THEN 'diretto'
          ELSE 'indiretto'
        END as tipo_relazione,
        COALESCE(SUM(st.spesa_prevista), 0) as fatturato_da_storico,
        COUNT(st.id) as numero_eventi
      FROM pr 
      LEFT JOIN storico_tavoli st ON pr.id = st.pr_id
      WHERE pr.id IN (${filter.prIds.join(',')})
      GROUP BY pr.id, pr.nickname, pr.nome, pr.cognome, pr.percentuale_provvigione, pr.tot_spesa_tavolo, pr.fk_padre
      ORDER BY tipo_relazione, pr.nickname
    `;
    
    db.all(query, [req.session.user.id], (err, prList) => {
      
      if (err) {
        console.error('[ADMIN GUADAGNI] Errore query PR:', err);
        return res.status(500).send('Errore nel recupero dati PR');
      }
      
      // Decritta i dati dei PR
      const { decryptUserArray } = require('../utils/crypto');
      const prListDecrypted = decryptUserArray(prList);
      
      // Calcola i guadagni per ogni PR
      const prGuadagni = prListDecrypted.map(pr => {
        // Fatturato totale (usa tot_spesa_tavolo se disponibile, altrimenti fatturato_da_storico)
        const fatturatoTotale = pr.tot_spesa_tavolo || pr.fatturato_da_storico || 0;
        
        // Percentuale PR + 85%
        const percentualeTotaleAlPR = (pr.percentuale_provvigione || 0) + 85;
        
        // Guadagno lordo admin = fatturato - (percentuale totale al PR)
        const guadagnoLordoAdmin = fatturatoTotale * (100 - percentualeTotaleAlPR) / 100;
        
        // Detrazioni dal guadagno lordo admin
        const detrazionePasso = guadagnoLordoAdmin * 0.20;  // 20%
        const detrazioneCassa = guadagnoLordoAdmin * 0.15;  // 15%
        const detrazioneCuzzo = guadagnoLordoAdmin * 0.15;  // 15%
        
        // Guadagno netto admin
        const guadagnoNettoAdmin = guadagnoLordoAdmin - detrazionePasso - detrazioneCassa - detrazioneCuzzo;
        
        return {
          ...pr,
          fatturatoTotale,
          percentualeTotaleAlPR,
          guadagnoLordoAdmin,
          detrazioni: {
            passo: detrazionePasso,
            cassa: detrazioneCassa,
            cuzzo: detrazioneCuzzo,
            totale: detrazionePasso + detrazioneCassa + detrazioneCuzzo
          },
          guadagnoNettoAdmin
        };
      });
      
      // Calcola totali
      const totali = {
        fatturatoTotale: prGuadagni.reduce((sum, pr) => sum + pr.fatturatoTotale, 0),
        guadagnoLordoTotale: prGuadagni.reduce((sum, pr) => sum + pr.guadagnoLordoAdmin, 0),
        detrazioniTotali: {
          passo: prGuadagni.reduce((sum, pr) => sum + pr.detrazioni.passo, 0),
          cassa: prGuadagni.reduce((sum, pr) => sum + pr.detrazioni.cassa, 0),
          cuzzo: prGuadagni.reduce((sum, pr) => sum + pr.detrazioni.cuzzo, 0)
        },
        guadagnoNettoTotale: prGuadagni.reduce((sum, pr) => sum + pr.guadagnoNettoAdmin, 0),
        numeroPR: prGuadagni.length,
        numeroEventiTotali: prGuadagni.reduce((sum, pr) => sum + pr.numero_eventi, 0)
      };
      
      totali.detrazioniTotali.totale = totali.detrazioniTotali.passo + totali.detrazioniTotali.cassa + totali.detrazioniTotali.cuzzo;
      
      console.log(`[ADMIN GUADAGNI] Calcoli completati per admin ${req.session.user.nickname}:`, {
        numeroPR: totali.numeroPR,
        fatturatoTotale: totali.fatturatoTotale,
        guadagnoNettoTotale: totali.guadagnoNettoTotale
      });
      
      res.render('admin/guadagni', {
        layout: 'admin/layout-new',
        title: 'ICONIC - Guadagni Admin',
        currentPage: 'guadagni',
        prGuadagni,
        totali,
        adminInfo: {
          id: req.session.user.id,
          nickname: req.session.user.nickname,
          nome: req.session.user.nome,
          cognome: req.session.user.cognome
        },
        adminFilter: filter
      });
    });
    
  } catch (error) {
    console.error('[ADMIN GUADAGNI] Errore generale:', error);
    res.status(500).send('Errore interno del server');
  }
});

module.exports = router;
