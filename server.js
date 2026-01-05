// Configurazione base Express, sessioni, EJS, SQLite
const crypto = require('crypto');
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const flash = require('connect-flash');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { initDB } = require('./models/db');
const favicon = require('serve-favicon');
const expressLayouts = require('express-ejs-layouts');

// Setup volume all'avvio (integrato)
if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Directory volume creata:', dataDir);
  } else {
    console.log('📁 Directory volume esistente:', dataDir);
  }
}

const app = express();
// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      // Allow common CDNs for third-party libs (Chart.js via jsdelivr)
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      // script-src-elem explicit fallback to allow external script elements
      scriptSrcElem: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            // Allow connections to CDNs for maps and external resources
            connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https:"] ,
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// SICUREZZA: Nascondi informazioni server
app.disable('x-powered-by');

// Inizializzazione del database
initDB();

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json()); // Per parsare JSON nelle richieste API
app.use(cookieParser());

// SICUREZZA: Servi SOLO la cartella public (non la root!)
app.use(express.static(path.join(__dirname, 'public')));

// Blocca accesso ai file sorgente
app.use(['/models', '/routes', '/controllers', '/views'], (req, res) => {
  res.status(403).send('Accesso negato');
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurazione layouts
app.use(expressLayouts);
app.set('layout', false); // Disabilita layout di default, useremo layout specifici

app.use(session({
    secret: process.env.SESSION_SECRET || 'iconic-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Semplificato - funziona ovunque
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 ore
    }
}));
app.use(flash());

// Middleware per il favicon (con gestione errori per produzione)
const faviconPath = path.join(__dirname, 'public', 'img', 'favicon.ico');
if (require('fs').existsSync(faviconPath)) {
  app.use(favicon(faviconPath));
}

// Rotte principali
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const prRoutes = require('./routes/pr');
const debugRoutes = require('./routes/debug'); // Route di debug

app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/admin', adminRoutes);
app.use('/pr', prRoutes);
app.use('/debug', debugRoutes); // Debug routes

// Redirect root a /login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Health check per Railway
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: process.env.RAILWAY_VOLUME_MOUNT_PATH ? 'Volume' : 'Local'
  });
});

// Gestione 404 - pagina non trovata
app.use((req, res) => {
  res.status(404).render('login', { 
    message: 'Pagina non trovata'
  });
});

// Gestione errori di produzione
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // In produzione, non mostrare dettagli errore
  if (process.env.NODE_ENV === 'production') {
    res.status(500).render('login', { 
      message: 'Errore interno del server'
    });
  } else {
    res.status(500).send(`<pre>${err.stack}</pre>`);
  }
});

// Avvio server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Aura Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Database: ${process.env.RAILWAY_VOLUME_MOUNT_PATH ? 'Volume persistente' : 'Locale'}`);
});

// Gestione segnali per Railway
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM ricevuto. Chiusura graceful...');
  server.close(() => {
    console.log('✅ Server chiuso correttamente');
    process.exit(0);
  });
  
  // Forza chiusura dopo 5 secondi se non risponde
  setTimeout(() => {
    console.log('⚠️ Chiusura forzata dopo timeout');
    process.exit(1);
  }, 5000);
});

process.on('SIGINT', () => {
  console.log('\n🔄 SIGINT ricevuto. Chiusura graceful...');
  server.close(() => {
    console.log('✅ Server chiuso correttamente');
    process.exit(0);
  });
  
  // Forza chiusura dopo 5 secondi se non risponde
  setTimeout(() => {
    console.log('⚠️ Chiusura forzata dopo timeout');
    process.exit(1);
  }, 5000);
});
