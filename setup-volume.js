/**
 * Script per creare la directory data se non esiste
 * Importante per Railway Volume
 */

const fs = require('fs');
const path = require('path');

// Crea directory se specificata via Railway Volume
if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Directory volume creata:', dataDir);
  } else {
    console.log('📁 Directory volume esistente:', dataDir);
  }
}

console.log('✅ Setup volume completato');
