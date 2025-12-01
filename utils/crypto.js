/**
 * Sistema di Crittografia per Dati Personali Sensibili
 * Gestisce la crittografia/decrittografia sicura di nomi, cognomi e numeri di telefono
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

class DataEncryption {
    constructor() {
        this.algorithm = 'aes-256-cbc';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
        
        // Inizializza la chiave di crittografia
        this.initializeEncryptionKey();
    }

    /**
     * Inizializza o carica la chiave di crittografia
     * Supporta sia file locale che variabile d'ambiente (per Railway)
     */
    initializeEncryptionKey() {
        try {
            // Prova prima con variabile d'ambiente (per Railway/production)
            if (process.env.ENCRYPTION_KEY) {
                this.key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
                return;
            }

            // Fallback su file locale (per sviluppo)
            const keyPath = path.join(__dirname, '../.encryption-key');
            
            if (fs.existsSync(keyPath)) {
                this.key = fs.readFileSync(keyPath);
            } else {
                // Genera una nuova chiave sicura
                this.key = crypto.randomBytes(this.keyLength);
                fs.writeFileSync(keyPath, this.key, { mode: 0o600 });
            }
        } catch (error) {
            throw new Error('Impossibile inizializzare il sistema di crittografia');
        }
    }

    /**
     * Cripta un dato sensibile
     * @param {string} data - Il dato da crittografare
     * @returns {string} - Il dato crittografato in formato base64 con IV
     */
    encrypt(data) {
        try {
            if (!data || typeof data !== 'string') {
                return data; // Ritorna il valore originale se non è una stringa valida
            }

            // Genera un IV casuale per ogni crittografia
            const iv = crypto.randomBytes(this.ivLength);
            
            // Crea il cipher con IV
            const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
            
            // Cripta i dati
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Combina IV + dati crittografati e converte in base64
            const combined = Buffer.concat([iv, Buffer.from(encrypted, 'hex')]);
            return combined.toString('base64');
            
        } catch (error) {
            throw new Error('Errore nella crittografia dei dati');
        }
    }

    /**
     * Decripta un dato sensibile
     * @param {string} encryptedData - Il dato crittografato in formato base64
     * @returns {string} - Il dato originale decrittografato
     */
    decrypt(encryptedData) {
        try {
            if (!encryptedData || typeof encryptedData !== 'string') {
                return encryptedData; // Ritorna il valore originale se non valido
            }

            // Se il dato non sembra crittografato, ritornalo così com'è
            if (!this.looksLikeEncryptedData(encryptedData)) {
                return encryptedData;
            }

            // Converte da base64 e separa IV e dati
            const combined = Buffer.from(encryptedData, 'base64');
            
            if (combined.length < this.ivLength) {
                throw new Error('Dati crittografati non validi');
            }

            const iv = combined.subarray(0, this.ivLength);
            const encrypted = combined.subarray(this.ivLength);
            
            // Crea il decipher con IV
            const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
            
            // Decripta i dati
            let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
            
        } catch (error) {
            // In caso di errore, ritorna il dato originale (potrebbe essere già decrittografato)
            return encryptedData;
        }
    }

    /**
     * Controlla se un dato ha l'aspetto di dati crittografati (senza tentare la decrittografia)
     * @param {string} data - Il dato da verificare
     * @returns {boolean} - True se sembra crittografato
     */
    looksLikeEncryptedData(data) {
        try {
            if (!data || typeof data !== 'string') {
                return false;
            }
            
            // I dati in chiaro non dovrebbero essere in base64 valido di lunghezza significativa
            // Controlla se sembra un nome/cognome/telefono normale
            if (data.length < 20 && /^[a-zA-ZàèéìòùÀÈÉÌÒÙ'\s\d-]+$/.test(data)) {
                return false; // Sembra dati in chiaro
            }
            
            // Controlla se è in formato base64 e ha una lunghezza minima
            const base64Regex = /^[A-Za-z0-9+/]+=*$/;
            if (!base64Regex.test(data)) {
                return false;
            }
            
            // Controlla se ha la lunghezza minima per contenere IV + dati
            const decoded = Buffer.from(data, 'base64');
            return decoded.length >= (this.ivLength + 1);
            
        } catch (error) {
            return false;
        }
    }

    /**
     * Cripta i campi sensibili di un oggetto utente
     * @param {Object} userData - Oggetto contenente i dati dell'utente
     * @returns {Object} - Oggetto con i campi sensibili crittografati
     */
    encryptUserData(userData) {
        if (!userData || typeof userData !== 'object') {
            return userData;
        }

        const encrypted = { ...userData };
        
        // Campi da crittografare
        const sensitiveFields = ['nome', 'cognome', 'numero_telefono'];
        
        sensitiveFields.forEach(field => {
            if (encrypted[field]) {
                encrypted[field] = this.encrypt(encrypted[field]);
            }
        });

        return encrypted;
    }

    /**
     * Decripta i campi sensibili di un oggetto utente
     * @param {Object} userData - Oggetto contenente i dati crittografati dell'utente
     * @returns {Object} - Oggetto con i campi sensibili decrittografati
     */
    decryptUserData(userData) {
        if (!userData || typeof userData !== 'object') {
            return userData;
        }

        const decrypted = { ...userData };
        
        // Campi da decrittografare
        const sensitiveFields = ['nome', 'cognome', 'numero_telefono'];
        
        sensitiveFields.forEach(field => {
            if (decrypted[field]) {
                decrypted[field] = this.decrypt(decrypted[field]);
            }
        });

        return decrypted;
    }

    /**
     * Decripta un array di oggetti utente
     * @param {Array} userArray - Array di oggetti utente
     * @returns {Array} - Array con i dati decrittografati
     */
    decryptUserArray(userArray) {
        if (!Array.isArray(userArray)) {
            return userArray;
        }

        return userArray.map(user => this.decryptUserData(user));
    }

    /**
     * Verifica se un dato sembra essere crittografato
     * @param {string} data - Il dato da verificare
     * @returns {boolean} - True se il dato sembra crittografato
     */
    isEncrypted(data) {
        try {
            if (!data || typeof data !== 'string') {
                return false;
            }
            
            // Controlla se è in formato base64 e ha una lunghezza minima
            const base64Regex = /^[A-Za-z0-9+/]+=*$/;
            if (!base64Regex.test(data)) {
                return false;
            }
            
            // Controlla se ha la lunghezza minima per contenere IV + dati
            const decoded = Buffer.from(data, 'base64');
            return decoded.length >= (this.ivLength + 1);
            
        } catch (error) {
            return false;
        }
    }

    /**
     * Genera un hash sicuro per la ricerca (non reversibile)
     * @param {string} data - Il dato di cui generare l'hash
     * @returns {string} - Hash SHA-256 del dato
     */
    generateSearchHash(data) {
        if (!data || typeof data !== 'string') {
            return null;
        }
        
        return crypto.createHash('sha256')
            .update(data.toLowerCase().trim())
            .digest('hex');
    }
}

// Crea un'istanza singleton
const dataEncryption = new DataEncryption();

module.exports = {
    DataEncryption,
    encrypt: (data) => dataEncryption.encrypt(data),
    decrypt: (data) => dataEncryption.decrypt(data),
    encryptUserData: (userData) => dataEncryption.encryptUserData(userData),
    decryptUserData: (userData) => dataEncryption.decryptUserData(userData),
    decryptUserArray: (userArray) => dataEncryption.decryptUserArray(userArray),
    isEncrypted: (data) => dataEncryption.isEncrypted(data),
    looksLikeEncryptedData: (data) => dataEncryption.looksLikeEncryptedData(data),
    generateSearchHash: (data) => dataEncryption.generateSearchHash(data)
};
