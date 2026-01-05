/* PAYMENT MODAL JAVASCRIPT - CSP-Compliant payment handlers */

document.addEventListener('DOMContentLoaded', function() {
  console.log('[PAYMENT] Initializing payment modal handlers');

  const paymentModal = document.getElementById('paymentModal');
  const closeBtn = document.querySelector('.modal-payment .close');

  // Apri modal di pagamento
  window.openPaymentModal = function(prId, nickname, amount) {
    console.log('[PAYMENT] Opening payment modal for PR:', prId, nickname, amount);
    
    if (!paymentModal) {
      console.error('[PAYMENT] Modal not found!');
      alert('Errore: modal pagamento non trovato');
      return;
    }
    
    try {
      document.getElementById('payment-pr-id').value = prId;
      document.getElementById('payment-pr-name').textContent = nickname;
      document.getElementById('payment-amount').textContent = `€${amount}`;
      document.getElementById('payment-amount-value').value = amount;
      
      paymentModal.style.display = 'block';
      document.body.style.overflow = 'hidden';
      
      console.log('[PAYMENT] Modal opened successfully');
    } catch (err) {
      console.error('[PAYMENT] Error opening modal:', err);
      alert('Errore nell\'apertura della finestra di pagamento');
    }
  }

  // Chiudi modal di pagamento
  window.closePaymentModal = function() {
    console.log('[PAYMENT] Closing payment modal');
    if (paymentModal) {
      paymentModal.style.display = 'none';
      document.body.style.overflow = '';
      const notesInput = document.getElementById('payment-notes');
      if (notesInput) notesInput.value = '';
    }
  }

  // Conferma pagamento
  window.confirmPayment = function() {
    const prId = document.getElementById('payment-pr-id').value;
    const amount = document.getElementById('payment-amount-value').value;
    const notes = document.getElementById('payment-notes').value;
    
    console.log('[PAYMENT] Submitting payment:', { prId, amount, notes });
    
    if (!prId || !amount) {
      alert('Dati mancanti per il pagamento');
      return;
    }
    
    // Invia richiesta di pagamento
    fetch('/admin/register-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prId: parseInt(prId),
        amount: parseFloat(amount),
        notes: notes
      })
    })
    .then(response => response.json())
    .then(data => {
      console.log('[PAYMENT] Server response:', data);
      if (data.success) {
        alert('Pagamento registrato con successo!');
        window.closePaymentModal();
        location.reload();
      } else {
        alert('Errore durante la registrazione del pagamento: ' + (data.error || 'Errore sconosciuto'));
      }
    })
    .catch(error => {
      console.error('[PAYMENT] Error:', error);
      alert('Errore durante la comunicazione con il server');
    });
  }

  // ===== EVENT LISTENERS =====

  // Pay button click handler - use event delegation
  document.addEventListener('click', function(e) {
    const payBtn = e.target.closest('.pay-btn');
    if (!payBtn) return;
    
    e.preventDefault();
    
    // Recupera dati dal data attribute
    const prId = payBtn.getAttribute('data-pr-id');
    const nickname = payBtn.getAttribute('data-nickname');
    const amount = payBtn.getAttribute('data-amount');
    
    console.log('[PAYMENT] Pay button clicked:', { prId, nickname, amount });
    
    if (prId && nickname && amount) {
      window.openPaymentModal(parseInt(prId), nickname, parseFloat(amount));
    } else {
      console.warn('[PAYMENT] Pay button missing data attributes:', payBtn);
    }
  });

  // Confirm Payment button
  document.addEventListener('click', function(e) {
    const confirmBtn = e.target.closest('.confirm-payment-btn');
    if (!confirmBtn) return;
    
    e.preventDefault();
    console.log('[PAYMENT] Confirm payment button clicked');
    window.confirmPayment();
  });

  // Cancel Payment button
  document.addEventListener('click', function(e) {
    const cancelBtn = e.target.closest('.cancel-payment-btn');
    if (!cancelBtn) return;
    
    e.preventDefault();
    console.log('[PAYMENT] Cancel payment button clicked');
    window.closePaymentModal();
  });

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', window.closePaymentModal);
  }

  // Close when clicking outside modal
  window.addEventListener('click', function(event) {
    if (event.target === paymentModal) {
      window.closePaymentModal();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && paymentModal && paymentModal.style.display === 'block') {
      window.closePaymentModal();
    }
  });

  console.log('[PAYMENT] Payment modal handlers initialized');
});
