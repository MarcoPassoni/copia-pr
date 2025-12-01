/**
 * Input Validator per ICONIC Dashboard
 * Validazione e sanitizzazione input utente
 */

const { body, param, query, validationResult } = require('express-validator');

// Middleware per gestire errori validazione
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Dati non validi',
            errors: errors.array()
        });
    }
    next();
};

// Validatori comuni
const validators = {
    // Dati utente
    nome: body('nome')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Nome deve essere tra 2 e 50 caratteri')
        .matches(/^[a-zA-ZàáâäãåąčćęèéêëėįìíîïłńòóôöõøùúûüųūÿýżźñçčšžÀÁÂÄÃÅĄĆČĖĘÈÉÊËÌÍÎÏĮŁŃÒÓÔÖÕØÙÚÛÜŲŪŸÝŻŹÑßÇŒÆČŠŽ\s'-]+$/)
        .withMessage('Nome contiene caratteri non validi'),
        
    cognome: body('cognome')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Cognome deve essere tra 2 e 50 caratteri')
        .matches(/^[a-zA-ZàáâäãåąčćęèéêëėįìíîïłńòóôöõøùúûüųūÿýżźñçčšžÀÁÂÄÃÅĄĆČĖĘÈÉÊËÌÍÎÏĮŁŃÒÓÔÖÕØÙÚÛÜŲŪŸÝŻŹÑßÇŒÆČŠŽ\s'-]+$/)
        .withMessage('Cognome contiene caratteri non validi'),
        
    nickname: body('nickname')
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Nickname deve essere tra 3 e 30 caratteri')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Nickname può contenere solo lettere, numeri, _ e -'),
        
    email: body('email')
        .isEmail()
        .withMessage('Email non valida')
        .normalizeEmail(),
        
    telefono: body('numero_telefono')
        .isMobilePhone('it-IT')
        .withMessage('Numero telefono non valido'),
        
    password: body('password')
        .isLength({ min: 8, max: 128 })
        .withMessage('Password deve essere tra 8 e 128 caratteri')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password deve contenere almeno: 1 minuscola, 1 maiuscola, 1 numero, 1 carattere speciale'),
        
    // Validatori ID
    userId: param('id')
        .isInt({ min: 1 })
        .withMessage('ID utente deve essere un numero positivo'),
        
    tavoloId: param('id')
        .isInt({ min: 1 })
        .withMessage('ID tavolo deve essere un numero positivo'),
        
    // Validatori query
    page: query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Numero pagina deve essere un numero positivo'),
        
    limit: query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limite deve essere tra 1 e 100')
};

// Set di validatori per diverse operazioni
const validationRules = {
    // Creazione utente
    createUser: [
        validators.nome,
        validators.cognome,
        validators.nickname,
        validators.email,
        validators.telefono,
        validators.password,
        body('ruolo').isIn(['PR', 'pre-admin', 'admin']).withMessage('Ruolo non valido'),
        handleValidationErrors
    ],
    
    // Aggiornamento utente
    updateUser: [
        validators.userId,
        validators.nome,
        validators.cognome,
        validators.telefono,
        handleValidationErrors
    ],
    
    // Login
    login: [
        body('nickname').trim().notEmpty().withMessage('Nickname richiesto'),
        body('password').notEmpty().withMessage('Password richiesta'),
        handleValidationErrors
    ],
    
    // Operazioni tavoli
    tavoloOperation: [
        validators.tavoloId,
        body('azione').isIn(['approva', 'rifiuta']).withMessage('Azione non valida'),
        handleValidationErrors
    ]
};

module.exports = {
    validators,
    validationRules,
    handleValidationErrors
};