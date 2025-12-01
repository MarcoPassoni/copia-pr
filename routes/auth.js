const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db, getUserByNickname } = require('../models/db');

// Login page
router.get('/login', (req, res) => {
  res.render('login', { message: req.flash('error') });
});

// Login POST
router.post('/login', (req, res) => {
  const { nickname, password } = req.body;
  
  // Debug rimosso per produzione
  
  // Cerca l'utente nelle tre tabelle in sequenza
  const searchTables = ['admin', 'pre_admin', 'pr'];
  let userFound = null;
  let searchIndex = 0;
  
  function searchInTable(tableName) {
    getUserByNickname(tableName, nickname, (err, user) => {
      if (err) {
        // [PRODUCTION] Removed console.log(`DEBUG: Errore ricerca in ${tableName}:`, err)
        // Continua con la prossima tabella
        searchIndex++;
        if (searchIndex < searchTables.length) {
          searchInTable(searchTables[searchIndex]);
        } else {
          // Nessun utente trovato in nessuna tabella
          req.flash('error', 'Credenziali non valide');
          return res.redirect('/login');
        }
        return;
      }
      
      if (user) {
        // Utente trovato, aggiungi il ruolo in base alla tabella
        user.ruolo = tableName === 'admin' ? 'admin' : 
                    tableName === 'pre_admin' ? 'pre_admin' : 'pr';
        
        // Debug rimosso per produzione
        
        // [PRODUCTION] Removed console.log('DEBUG: Utente trovato (dati decrittografati):', {
        //   id: user.id,
        //   nickname: user.nickname,
        //   ruolo: user.ruolo,
        //   nome: user.nome,
        //   cognome: user.cognome
        // });
        
        // Verifica password
        bcrypt.compare(password, user.password, (err, result) => {
          // Debug rimosso per produzione
          
          if (err) {
            // [PRODUCTION] Removed console.log('DEBUG: Errore bcrypt', err)
            req.flash('error', 'Errore interno');
            return res.redirect('/login');
          }
          
          if (result) {
            req.session.user = { 
              id: user.id, 
              ruolo: user.ruolo, 
              nickname: user.nickname,
              nome: user.nome,
              cognome: user.cognome,
              poteri: user.poteri || 0
            };
            
            if (user.ruolo === 'admin') {
              return res.redirect('/admin/staff');
            } else if (user.ruolo === 'pr') {
              return res.redirect('/pr/dashboard');
            } else {
              return res.redirect('/dashboard');
            }
          } else {
            // Password errata
            req.flash('error', 'Credenziali non valide');
            return res.redirect('/login');
          }
        });
      } else {
        // Utente non trovato in questa tabella, prova la prossima
        searchIndex++;
        if (searchIndex < searchTables.length) {
          searchInTable(searchTables[searchIndex]);
        } else {
          // Nessun utente trovato in nessuna tabella
          req.flash('error', 'Credenziali non valide');
          return res.redirect('/login');
        }
      }
    });
  }
  
  // Inizia la ricerca dalla prima tabella
  searchInTable(searchTables[searchIndex]);
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
