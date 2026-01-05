/* STAFF MANAGEMENT JAVASCRIPT - CSP-Compliant edit/delete handlers */

document.addEventListener('DOMContentLoaded', function() {
  console.log('[STAFF] Initializing staff management handlers');

  // Recupera i dati utenti dal data attribute
  const staffDataStorage = document.getElementById('staff-data-storage');
  let usersData = [];
  
  if (staffDataStorage) {
    try {
      const dataJson = staffDataStorage.getAttribute('data-utenti');
      usersData = JSON.parse(dataJson);
      console.log('[STAFF] Users data loaded:', usersData.length, 'users');
    } catch (err) {
      console.error('[STAFF] Error parsing users data:', err);
      usersData = [];
    }
  }

  // ===== FUNZIONI HELPER =====
  
  // Chiudi modal di modifica
  function closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('modal-active');
      document.body.style.overflow = '';
      const form = document.getElementById('editForm');
      if (form) form.reset();
    }
  }
  
  // Esponi globalmente per accesso interno
  window.closeEditModal = closeEditModal;
  
  // Apri modal di modifica
  function openEditModal(user) {
    console.log('[STAFF] Opening edit modal for user:', user.nickname);
    
    try {
      // Popola i campi del form
      document.getElementById('edit-id').value = user.id;
      document.getElementById('edit-ruolo').value = user.ruolo;
      document.getElementById('edit-nickname').value = user.nickname;
      document.getElementById('edit-nome').value = user.nome;
      document.getElementById('edit-cognome').value = user.cognome;
      document.getElementById('edit-telefono').value = user.numero_telefono;
      
      // Gestisci campo padre
      const padreField = document.getElementById('padre-field');
      const padreSelect = document.getElementById('edit-padre');
      
      if (padreField && padreSelect) {
        // Svuota il select padre
        padreSelect.innerHTML = '<option value="">Nessun padre</option>';
        
        // Mostra/nascondi campo padre in base al ruolo
        if (user.ruolo === 'admin') {
          padreField.style.display = 'none';
        } else {
          padreField.style.display = 'block';
          
          // Popola le opzioni padre in base al ruolo dell'utente
          let possibiliPadri = [];
          if (user.ruolo === 'pre_admin') {
            possibiliPadri = usersData.filter(u => u.ruolo === 'admin');
          } else if (user.ruolo === 'pr') {
            possibiliPadri = usersData.filter(u => 
              (u.ruolo === 'admin' || u.ruolo === 'pre_admin' || u.ruolo === 'pr') && u.id !== user.id
            );
          }
          
          // Aggiungi le opzioni
          possibiliPadri.forEach(padre => {
            const option = document.createElement('option');
            option.value = padre.id;
            option.textContent = `${padre.nickname} (${padre.ruolo})`;
            padreSelect.appendChild(option);
          });
          
          // Imposta il padre attuale
          if (user.padre_id) {
            padreSelect.value = user.padre_id;
          } else if (user.padre_nickname && user.padre_nickname !== 'Nessuno') {
            const padreAttuale = usersData.find(u => u.nickname === user.padre_nickname);
            if (padreAttuale) {
              padreSelect.value = padreAttuale.id;
            }
          }
        }
      }
      
      // Mostra/nascondi campi PR
      const prFields = document.getElementById('pr-fields');
      if (prFields) {
        if (user.ruolo === 'pr') {
          prFields.style.display = 'block';
          const percInput = document.getElementById('edit-percentuale');
          const potetiInput = document.getElementById('edit-poteri');
          if (percInput) percInput.value = user.percentuale_provvigione;
          if (potetiInput) potetiInput.checked = user.poteri == 1;
        } else {
          prFields.style.display = 'none';
        }
      }
      
      // Mostra il modal
      const modal = document.getElementById('editModal');
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal-active');
        document.body.style.overflow = 'hidden';
      }
    } catch (err) {
      console.error('[STAFF] Error opening edit modal:', err);
      alert('Errore nell\'apertura della finestra di modifica');
    }
  }
  
  // Mostra messaggio di successo
  function showSuccessMessage(message) {
    const alert = document.getElementById('successAlert');
    const messageSpan = document.getElementById('successMessage');
    
    if (alert && messageSpan) {
      messageSpan.textContent = message;
      alert.style.display = 'block';
      
      setTimeout(() => {
        alert.style.display = 'none';
      }, 3000);
    }
  }
  
  // Elimina utente via fetch
  window.deleteUser = function(id, nickname, ruolo) {
    console.log('[STAFF] Delete request for:', id, nickname, ruolo);
    
    if (!confirm(`Sei sicuro di voler eliminare l'utente "${nickname}" (${ruolo})?`)) {
      return;
    }
    
    fetch('/admin/staff/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `id=${encodeURIComponent(id)}&ruolo=${encodeURIComponent(ruolo)}`
    })
    .then(response => {
      console.log('[STAFF] Delete response status:', response.status);
      if (response.ok) {
        showSuccessMessage(`Utente "${nickname}" eliminato con successo!`);
        setTimeout(() => {
          location.reload();
        }, 1500);
      } else {
        return response.text().then(text => {
          throw new Error(text || 'Server error');
        });
      }
    })
    .catch(error => {
      console.error('[STAFF] Delete error:', error);
      alert('Errore durante l\'eliminazione dell\'utente: ' + error.message);
    });
  }
  
  // ===== EVENT LISTENERS =====
  
  // Edit button click handler
  document.addEventListener('click', function(e) {
    const editBtn = e.target.closest('.edit-btn');
    if (!editBtn) return;
    
    e.preventDefault();
    console.log('[STAFF] Edit button clicked - ID:', editBtn.dataset.id);
    
    const userId = parseInt(editBtn.dataset.id);
    const user = usersData.find(u => u.id === userId);
    
    if (user) {
      openEditModal(user);
    } else {
      console.error('[STAFF] User not found:', userId);
      alert('Errore: utente non trovato!');
    }
  });
  
  // Delete button click handler
  document.addEventListener('click', function(e) {
    const deleteBtn = e.target.closest('.action-btn.btn-delete');
    if (!deleteBtn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const userId = deleteBtn.dataset.id;
    const nickname = deleteBtn.dataset.nickname;
    const ruolo = deleteBtn.dataset.ruolo;
    
    console.log('[STAFF] Delete button clicked:', userId, nickname, ruolo);
    
    if (userId && nickname && ruolo) {
      window.deleteUser(userId, nickname, ruolo);
    } else {
      console.warn('[STAFF] Delete button missing data attributes');
    }
  });
  
  // Modal close button
  const closeBtn = document.querySelector('.close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeEditModal);
  }
  
  // Modal cancel buttons
  const modalCancelBtns = document.querySelectorAll('.modal-cancel');
  modalCancelBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeEditModal();
    });
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', function(event) {
    const modal = document.getElementById('editModal');
    if (event.target === modal) {
      closeEditModal();
    }
  });
  
  // Form validation on submit
  const editForm = document.getElementById('editForm');
  if (editForm) {
    editForm.addEventListener('submit', function(e) {
      const nickname = document.getElementById('edit-nickname').value.trim();
      const telefono = document.getElementById('edit-telefono').value.trim();
      const password = document.getElementById('edit-password').value;
      const currentUserId = parseInt(document.getElementById('edit-id').value);
      
      // Check duplicate nickname
      const duplicateNickname = usersData.find(u => u.nickname === nickname && u.id !== currentUserId);
      if (duplicateNickname) {
        e.preventDefault();
        alert('Errore: Il nickname "' + nickname + '" è già utilizzato da un altro utente.');
        return false;
      }
      
      // Check password length
      if (password && password.length < 6) {
        e.preventDefault();
        alert('Errore: La password deve essere di almeno 6 caratteri.');
        return false;
      }
      
      // Check phone number
      const phoneRegex = /^[0-9]{8,15}$/;
      if (!phoneRegex.test(telefono)) {
        e.preventDefault();
        alert('Errore: Il numero di telefono deve contenere solo cifre (8-15 caratteri).');
        return false;
      }
      
      // Confirm submission
      if (!confirm('Sei sicuro di voler salvare le modifiche?')) {
        e.preventDefault();
        return false;
      }
    });
  }
  
  // Handle success message in URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('success') === 'modifica') {
    showSuccessMessage('Utente modificato con successo!');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  
  // Close success alert when clicking close button
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('alert-close')) {
      const alert = e.target.closest('.alert');
      if (alert) alert.style.display = 'none';
    }
  });

  console.log('[STAFF] Management handlers initialized');
});
