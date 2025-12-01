/**
 * Secure Logger per ICONIC Dashboard
 * Sostituisce console.log per produzione sicura
 */

const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'iconic-dashboard' },
    transports: [
        // File per errori
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // File per tutti i log
        new winston.transports.File({ 
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 10
        })
    ]
});

// Console solo in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Security logger separato
const securityLogger = winston.createLogger({
    level: 'warn',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: 'logs/security.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

// Funzione per log eventi sicurezza
const logSecurityEvent = (event, details, req = null) => {
    const logData = {
        event,
        details,
        timestamp: new Date().toISOString()
    };
    
    if (req) {
        logData.ip = req.ip || req.connection.remoteAddress;
        logData.userAgent = req.get('User-Agent');
        logData.url = req.originalUrl;
        logData.method = req.method;
    }
    
    securityLogger.warn(logData);
};

module.exports = {
    logger,
    securityLogger,
    logSecurityEvent
};