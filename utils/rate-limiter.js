/**
 * Rate Limiter per ICONIC Dashboard
 * Protezione contro brute force e abuse
 */

const rateLimit = require('express-rate-limit');
const { logSecurityEvent } = require('./secure-logger');

// Rate limiter per login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: 5, // 5 tentativi per IP
    message: {
        success: false,
        message: 'Troppi tentativi di login. Riprova tra 15 minuti.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logSecurityEvent('LOGIN_RATE_LIMIT', {
            ip: req.ip,
            attempts: req.rateLimit.totalHits
        }, req);
        
        res.status(429).json({
            success: false,
            message: 'Troppi tentativi di login. Riprova tra 15 minuti.'
        });
    }
});

// Rate limiter generico API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minuti
    max: 100, // 100 richieste per IP
    message: {
        success: false,
        message: 'Troppe richieste. Riprova più tardi.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter per operazioni admin
const adminLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 30, // 30 operazioni per minuto
    message: {
        success: false,
        message: 'Troppe operazioni admin. Rallenta le richieste.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    loginLimiter,
    apiLimiter,
    adminLimiter
};