/* MOBILE ENHANCEMENTS JAVASCRIPT */

// Funzioni per migliorare l'esperienza mobile dell'admin panel
document.addEventListener('DOMContentLoaded', function() {
  
  // ===== CHIUSURA AUTOMATICA SIDEBAR ===== //
  const sidebarLinks = document.querySelectorAll('.mobile-nav-item');
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('mobileOverlay');
  const hamburger = document.getElementById('hamburger');
  const body = document.body;

  // Chiudi sidebar quando clicchi su un link su mobile
  sidebarLinks.forEach(link => {
    link.addEventListener('click', function() {
      if (window.innerWidth <= 768) {
        setTimeout(() => {
          sidebar.classList.remove('open');
          overlay.classList.remove('active');
          hamburger.classList.remove('active');
          body.classList.remove('sidebar-open');
        }, 150); // Piccolo delay per permettere la navigazione
      }
    });
  });

  // ===== OTTIMIZZAZIONI TOUCH ===== //
  
  // Previeni zoom accidentale su doppio tap sui bottoni (esclusi tutti i submit)
  const mobileButtons = document.querySelectorAll('.btn-mobile, .mobile-btn');
  // Escludo esplicitamente tutti i bottoni che potrebbero essere submit
  const submitButtons = document.querySelectorAll('button[type="submit"], input[type="submit"], .btn-primary-mobile, .btn-success-mobile, .btn-danger-mobile');
  
  mobileButtons.forEach(button => {
    // Verifica tripla per non interferire con submit
    const isSubmit = button.type === 'submit' || 
                     button.hasAttribute('type') && button.getAttribute('type') === 'submit' ||
                     button.closest('form') !== null;
    
    if (!isSubmit) {
      button.addEventListener('touchend', function(e) {
        e.preventDefault();
        this.click();
      });
    }
  });
  
  // Log di debug per vedere quali bottoni stiamo processando
  console.log('Mobile buttons found:', mobileButtons.length);
  console.log('Submit buttons found:', submitButtons.length);

  // ===== GESTIONE ORIENTAMENTO ===== //
  
  // Riorganizza layout quando cambia orientamento
  window.addEventListener('orientationchange', function() {
    setTimeout(() => {
      // Aggiorna altezze e layout
      updateMobileLayout();
      
      // Chiudi sidebar se aperta in landscape
      if (Math.abs(window.orientation) === 90) { // landscape
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        hamburger.classList.remove('active');
        body.classList.remove('sidebar-open');
      }
    }, 100);
  });

  // ===== SCROLL IMPROVEMENTS ===== //
  
  // Smooth scroll per le card mobile
  const cardContainers = document.querySelectorAll('.mobile-cards-container');
  cardContainers.forEach(container => {
    if (container) {
      container.style.scrollBehavior = 'smooth';
      container.style.WebkitOverflowScrolling = 'touch';
    }
  });

  // ===== FILTRI MOBILE ===== //
  
  // Migliora i filtri per mobile
  const filterSelects = document.querySelectorAll('select');
  filterSelects.forEach(select => {
    if (window.innerWidth <= 768) {
      select.style.fontSize = '16px'; // Previene zoom su iOS
      select.style.minHeight = '44px'; // Touch target
    }
  });

  // ===== FEEDBACK VISUAL ===== //
  
  // Aggiungi feedback visivo per i tap
  const touchableElements = document.querySelectorAll('.mobile-data-card, .mobile-nav-item, .btn-mobile');
  touchableElements.forEach(element => {
    element.addEventListener('touchstart', function() {
      this.style.transform = 'scale(0.98)';
      this.style.transition = 'transform 0.1s ease';
    });
    
    element.addEventListener('touchend', function() {
      this.style.transform = 'scale(1)';
    });
    
    element.addEventListener('touchcancel', function() {
      this.style.transform = 'scale(1)';
    });
  });

  // ===== GESTIONE TASTIERA VIRTUALE ===== //
  
  // Gestisci il resize quando appare la tastiera
  let initialViewportHeight = window.innerHeight;
  
  window.addEventListener('resize', function() {
    const currentHeight = window.innerHeight;
    const heightDifference = initialViewportHeight - currentHeight;
    
    // Se la differenza è significativa, probabilmente è apparsa la tastiera
    if (heightDifference > 150 && window.innerWidth <= 768) {
      document.body.classList.add('keyboard-visible');
      
      // Riduci padding bottom per compensare
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.style.paddingBottom = '20px';
      }
    } else {
      document.body.classList.remove('keyboard-visible');
      
      // Ripristina padding
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.style.paddingBottom = '';
      }
    }
  });

  // ===== UTILITÀ ===== //
  
  function updateMobileLayout() {
    if (window.innerWidth <= 768) {
      // Nascondi tabelle e mostra card
      document.querySelectorAll('.table-responsive, .data-table').forEach(table => {
        table.style.display = 'none';
      });
      
      document.querySelectorAll('.mobile-data-cards, .mobile-cards-container').forEach(cards => {
        cards.style.display = 'block';
      });
      
      // Aggiorna altezze
      const mainContent = document.querySelector('.admin-main');
      if (mainContent) {
        mainContent.style.minHeight = 'calc(100vh - 50px)';
      }
      
    } else {
      // Mostra tabelle e nascondi card
      document.querySelectorAll('.table-responsive, .data-table').forEach(table => {
        table.style.display = '';
      });
      
      document.querySelectorAll('.mobile-data-cards, .mobile-cards-container').forEach(cards => {
        cards.style.display = 'none';
      });
    }
  }

  // ===== PERFORMANCE ===== //
  
  // Throttle per resize events
  let resizeTimeout;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(updateMobileLayout, 100);
  });

  // Inizializza layout
  updateMobileLayout();

  // ===== HAPTIC FEEDBACK (se supportato) ===== //
  
  function triggerHapticFeedback() {
    if ('vibrate' in navigator) {
      navigator.vibrate(10); // Vibrazione leggera
    }
  }

  // Aggiungi haptic feedback ai bottoni importanti
  const importantButtons = document.querySelectorAll('.btn-success-mobile, .btn-danger-mobile');
  importantButtons.forEach(button => {
    button.addEventListener('touchstart', triggerHapticFeedback);
  });

  // ===== ACCESSIBILITY ===== //
  
  // Migliora accessibility per screen readers
  if (window.innerWidth <= 768) {
    // Aggiorna aria-labels
    const navItems = document.querySelectorAll('.mobile-nav-item');
    navItems.forEach(item => {
      const text = item.textContent.trim();
      item.setAttribute('aria-label', `Navigazione: ${text}`);
    });
    
    // Aggiorna i bottoni
    const mobileButtons = document.querySelectorAll('.btn-mobile');
    mobileButtons.forEach(button => {
      if (!button.getAttribute('aria-label')) {
        const text = button.textContent.trim();
        button.setAttribute('aria-label', text);
      }
    });
  }

  // ===== LOGGING ===== //
  
  console.log('📱 Mobile enhancements loaded successfully');
  console.log('📱 Viewport:', window.innerWidth + 'x' + window.innerHeight);
  console.log('📱 Device pixel ratio:', window.devicePixelRatio);
  console.log('📱 Touch support:', 'ontouchstart' in window);

});

// ===== EXPORT FUNCTIONS ===== //

// Funzione per forzare update del layout (per uso da console)
window.updateMobileLayout = function() {
  const event = new Event('resize');
  window.dispatchEvent(event);
};

// Funzione per debug mobile
window.debugMobile = function() {
  console.log('=== MOBILE DEBUG INFO ===');
  console.log('Viewport:', window.innerWidth + 'x' + window.innerHeight);
  console.log('Screen:', screen.width + 'x' + screen.height);
  console.log('Device pixel ratio:', window.devicePixelRatio);
  console.log('User agent:', navigator.userAgent);
  console.log('Touch events:', 'ontouchstart' in window);
  console.log('Orientation:', window.orientation || 'unknown');
  console.log('========================');
};

// ===== GESTIONE DROPDOWN SUPERVISOR (Page nuovo-utente) ===== //
function initNuovoUtenteForm() {
  const padreSelect = document.getElementById('padre-select');
  if (!padreSelect) return; // Non siamo nella pagina nuovo-utente
  
  console.log('[FORM] Inizializzo form nuovo-utente');
  
  // Leggi i dati dal data attribute
  let utenti = [];
  const utenteData = padreSelect.getAttribute('data-utenti');
  if (utenteData) {
    try {
      utenti = JSON.parse(utenteData);
      console.log('[FORM] Utenti caricati:', utenti);
    } catch (e) {
      console.error('[FORM] Errore parsing utenti:', e);
    }
  }
  
  // Leggi dati form dal storage
  let formData = null;
  const formDataDiv = document.getElementById('form-data-storage');
  if (formDataDiv) {
    const formDataAttr = formDataDiv.getAttribute('data-form-data');
    if (formDataAttr && formDataAttr !== 'null') {
      try {
        formData = JSON.parse(formDataAttr);
        console.log('[FORM] Form data ripristinati:', formData);
      } catch (e) {
        console.error('[FORM] Errore parsing form data:', e);
      }
    }
  }
  
  // Funzione per aggiornare il dropdown dei padri
  function aggiornaPadri() {
    const ruolo = document.getElementById('ruolo-select').value;
    const selectedPadreId = formData ? formData.padre_id : null;
    
    console.log('[FORM] Aggiorno padri per ruolo:', ruolo);
    
    padreSelect.innerHTML = '';
    
    if (ruolo === 'admin') {
      padreSelect.innerHTML = '<option value="">Nessuno</option>';
      padreSelect.disabled = true;
    } else if (ruolo === 'pre_admin') {
      padreSelect.disabled = false;
      const adminList = utenti.filter(u => u.ruolo === 'admin');
      if (adminList.length === 0) {
        padreSelect.innerHTML = '<option value="">Nessun admin disponibile</option>';
        padreSelect.disabled = true;
      } else {
        adminList.forEach(u => {
          const selected = selectedPadreId == u.id ? 'selected' : '';
          padreSelect.innerHTML += `<option value="${u.id}" ${selected}>${u.nickname} (admin)</option>`;
        });
      }
    } else if (ruolo === 'pr') {
      padreSelect.disabled = false;
      const padreList = utenti.filter(u => u.ruolo === 'admin' || u.ruolo === 'pre_admin' || u.ruolo === 'pr');
      if (padreList.length === 0) {
        padreSelect.innerHTML = '<option value="">Nessun padre disponibile</option>';
        padreSelect.disabled = true;
      } else {
        padreList.forEach(u => {
          const selected = selectedPadreId == u.id ? 'selected' : '';
          padreSelect.innerHTML += `<option value="${u.id}" ${selected}>${u.nickname} (${u.ruolo})</option>`;
        });
      }
    }
  }
  
  // Aggiungi event listener al cambio di ruolo
  const ruoloSelect = document.getElementById('ruolo-select');
  if (ruoloSelect) {
    ruoloSelect.addEventListener('change', aggiornaPadri);
    // Inizializza al caricamento
    aggiornaPadri();
  }
  
  // Gestione poteri PR
  const poteriLabel = document.getElementById('poteri-label');
  const poteriCheckbox = document.getElementById('poteri-checkbox');
  
  if (poteriLabel && poteriCheckbox && ruoloSelect) {
    function gestisciPoteri() {
      if (ruoloSelect.value === 'pr') {
        poteriLabel.style.display = 'flex';
      } else {
        poteriLabel.style.display = 'none';
        poteriCheckbox.checked = false;
      }
    }
    
    ruoloSelect.addEventListener('change', gestisciPoteri);
    gestisciPoteri(); // Inizializza
  }
  
  console.log('[FORM] Form nuovo-utente inizializzato');
}

// ===== PASSWORD TOGGLE BUTTONS =====
function initPasswordToggle() {
  console.log('[PASSWORD] Initializing password toggle handlers');
  
  // Event delegation per tutti i password-toggle buttons
  document.addEventListener('click', function(e) {
    const toggleBtn = e.target.closest('.password-toggle');
    if (!toggleBtn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    console.log('[PASSWORD] Toggle button clicked');
    
    // Ricerca il target input (può essere data-target o il precedente)
    let targetInput = null;
    
    const targetId = toggleBtn.getAttribute('data-target');
    if (targetId) {
      targetInput = document.getElementById(targetId);
    }
    
    // Fallback: cerca il precedente input
    if (!targetInput) {
      targetInput = toggleBtn.previousElementSibling;
      while (targetInput && !targetInput.matches('input[type="password"], input[type="text"]')) {
        targetInput = targetInput.previousElementSibling;
      }
    }
    
    if (!targetInput) {
      console.warn('[PASSWORD] Target input not found for toggle button:', toggleBtn);
      return;
    }
    
    console.log('[PASSWORD] Target input found:', targetInput.id || 'unnamed');
    
    // Toggle the password visibility
    const icon = toggleBtn.querySelector('i');
    if (!icon) {
      console.warn('[PASSWORD] Icon not found in toggle button');
      return;
    }
    
    if (targetInput.type === 'password') {
      targetInput.type = 'text';
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
      console.log('[PASSWORD] Password visible');
    } else {
      targetInput.type = 'password';
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
      console.log('[PASSWORD] Password hidden');
    }
  });
  
  console.log('[PASSWORD] Password toggle handlers initialized');
}

// ===== INITIALIZATION =====
// Chiama le funzioni quando il DOM è pronto
initNuovoUtenteForm();
initPasswordToggle();