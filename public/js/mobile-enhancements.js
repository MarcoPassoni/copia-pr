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