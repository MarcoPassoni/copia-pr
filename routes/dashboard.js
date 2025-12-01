const express = require('express');
const router = express.Router();

// Middleware autenticazione
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

// Dashboard principale
router.get('/', isAuthenticated, (req, res) => {
  // Mostra dashboard diversa in base al ruolo
  res.render('dashboard', { user: req.session.user });
});

module.exports = router;
