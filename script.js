// ========= KONFIGURACJA =========
const CONFIG = {
  EMAILJS_SERVICE_ID: 'service_kq8zmvw',
  EMAILJS_TEMPLATE_ID: 'template_51u6xub',          // mail z przydzialem do druzyny
  EMAILJS_TEMPLATE_CONFIRM: 'template_ruv9fdr',  // <-- NOWY: mail po zapisie
  EMAILJS_PUBLIC_KEY: 'nKv_qZgxWLURjtk2V',
  // Hasła admina NIE MA w tym pliku - siedzi w Apps Script (Wlasciwosci skryptu).
  // Patrz instrukcja, Etap 1.6.
  REGISTRATION_DEADLINE: new Date('2026-08-29T23:59:59'),
  MAX_PARTICIPANTS: 40,
  EVENT_DATE_TEXT: '3 października 2026',
  EVENT_DATE_ISO: '2026-10-03',        // do sprawdzania daty zdjec
  // Wspolrzedne miejsca zbiorki - do sprawdzania GPS na zdjeciach.
  // Jak je zdobyc: Mapy Google -> prawy klik na miejscu -> kliknij wspolrzedne (kopiuja sie).
  // Zostaw null, jesli nie chcesz sprawdzac lokalizacji.
  EVENT_LAT: 52.796917,        // 52°47'48.9"N
  EVENT_LON: 21.498333,        // 21°29'54.0"E
  EVENT_RADIUS_KM: 5,                  // w takim promieniu zdjecie uznajemy za zrobione na miejscu
  MEETING_POINT_TEXT: 'ul. Wilcza 14, Grądy Szlacheckie, godz. 11:00',
  // Zostaw pusty - adres wykryje sie sam. Wypelnij TYLKO gdy zdjecie w mailu
  // sie nie wyswietla, np. 'https://grzybobranie.pages.dev/'  (ze slashem na koncu!)
  SITE_URL_OVERRIDE: '',
  // <-- WKLEJ TU NOWY URL /exec z tegorocznego wdrożenia Apps Script
  WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbwQWTzGigpXfDApee-zmtBEC2wacLe5W3f0YEbjEvIgjRRdRrPHdXVhWTUYfOHYScv59g/exec'
};

// ===== ZDJECIA Z ZESZLEGO ROKU =====
// Wrzuc pliki do folderu "zdjecia" obok index.html i dopisz je tutaj.
// Pusta lista = zakladka pokaze komunikat "wkrotce".
const GALLERY_PHOTOS = [
  // { file: 'las-01.jpg',  caption: 'Start o poranku' },
  // { file: 'kosz-02.jpg', caption: 'Zdobycz druzyny Borowiki' },
  // { file: 'grill-03.jpg',caption: 'Ognisko po zawodach' },
];

// ========= INICJALIZACJA =========
let participants = [];
let teams = [];
let isAdminMode = false;
// Hasło podane przy logowaniu. Trzymane tylko w pamięci karty przeglądarki,
// znika po odświeżeniu strony. Nigdzie się nie zapisuje.
let adminToken = '';

if (typeof emailjs !== 'undefined' && emailjs.init) {
  emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);
}

// ========= FUNKCJE POMOCNICZE =========
function showMessage(message, type = 'info') {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.style.cssText = `
    position: fixed; top: 20px; right: 20px; padding: 15px 20px;
    border-radius: 8px; color: white; font-weight: bold; z-index: 1000; max-width: 300px;
  `;
  div.style.backgroundColor = type === 'success' ? '#4CAF50'
    : type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3';
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}

function formatDate(date) {
  return new Date(date).toLocaleString('pl-PL', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ========= NAWIGACJA =========

// Karta misji jest ukryta do czasu losowania drużyn.
// Wcześniej nikomu nie jest potrzebna, a podglądanie zadań przed startem
// psułoby zabawę.
function updateMissionsTabVisibility() {
  const btn = document.getElementById('missionsTabBtn');
  if (!btn) return;

  const widoczna = teams.length > 0;
  btn.style.display = widoczna ? '' : 'none';

  // Gdyby ktoś siedział na tej zakładce, gdy drużyny zniknęły
  if (!widoczna) {
    const panel = document.getElementById('missions');
    if (panel && panel.classList.contains('active')) showTab('registration');
  }
}

function showTab(tabId) {
  try {
    if (tabId === 'results') startPublicScores();
    else stopPublicScores();
  } catch (e) {}

  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));

  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');

  const button = document.querySelector(`[onclick="showTab('${tabId}')"]`);
  if (button) button.classList.add('active');
}

// ========= AKTUALIZACJA LICZBY UCZESTNIKÓW =========
function updateParticipantCount() {
  const countElement = document.getElementById('participantCount');
  if (countElement) {
    countElement.textContent = participants.length;
  }
}

// ========= POBIERANIE DANYCH - MULTIPLE FALLBACK METHODS =========
function fetchParticipantsFromSheet() {
  return new Promise((resolve, reject) => {
    console.log('Pobieranie danych z Google Sheets...');

    // Próba 1: JSONP
    const callbackName = 'jsonp_' + Date.now();
    const script = document.createElement('script');
    let resolved = false;

    window[callbackName] = function(data) {
      if (resolved) return;
      resolved = true;

      try {
        console.log('JSONP - otrzymane dane:', data);

        if (Array.isArray(data)) {
          participants = data.map(participant => ({
            id: participant.ID || participant.id || Date.now() + Math.random(),
            name: participant['Imię'] || participant.name || '',
            email: participant['Email'] || participant.email || '',
            phone: participant['Telefon'] || participant.phone || '',
            experience: participant['Doświadczenie'] || participant.experience || '',
            diet: participant['Dieta'] || participant.diet || '',
            registrationDate: participant['Data rejestracji'] || participant.registrationDate || new Date().toISOString(),
            teamId: participant['ID drużyny'] || participant.teamId || null
          }));

          localStorage.setItem('grzybobranie_participants', JSON.stringify(participants));
          updateParticipantCount();
          loadParticipants();
          showMessage('Dane pobrane z Google Sheets (JSONP)', 'success');
        }

        cleanup();
        resolve(participants);

      } catch (error) {
        console.error('Błąd JSONP:', error);
        cleanup();
        tryFetch();
      }
    };

    function cleanup() {
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (window[callbackName]) {
        delete window[callbackName];
      }
    }

    function tryFetch() {
      if (resolved) return;

      // Próba 2: Regular fetch
      fetch(CONFIG.WEB_APP_URL + '?action=get')
        .then(response => response.json())
        .then(data => {
          if (resolved) return;
          resolved = true;

          console.log('Fetch - otrzymane dane:', data);

          if (Array.isArray(data)) {
            participants = data.map(participant => ({
              id: participant.ID || participant.id || Date.now() + Math.random(),
              name: participant['Imię'] || participant.name || '',
              email: participant['Email'] || participant.email || '',
              phone: participant['Telefon'] || participant.phone || '',
              experience: participant['Doświadczenie'] || participant.experience || '',
              diet: participant['Dieta'] || participant.diet || '',
              registrationDate: participant['Data rejestracji'] || participant.registrationDate || new Date().toISOString(),
              teamId: participant['ID drużyny'] || participant.teamId || null
            }));

            localStorage.setItem('grzybobranie_participants', JSON.stringify(participants));
            updateParticipantCount();
            loadParticipants();
            showMessage('Dane pobrane z Google Sheets (fetch)', 'success');
          }

          resolve(participants);
        })
        .catch(error => {
          if (resolved) return;
          resolved = true;

          console.error('Błąd fetch:', error);
          showMessage('Nie można pobrać danych - używam lokalnych', 'warning');
          resolve(participants);
        });
    }

    // Timeout dla JSONP
    setTimeout(() => {
      if (!resolved) {
        console.log('JSONP timeout, próbuję fetch...');
        cleanup();
        tryFetch();
      }
    }, 5000);

    script.src = `${CONFIG.WEB_APP_URL}?action=get&callback=${callbackName}`;
    script.onerror = function() {
      console.log('JSONP error, próbuję fetch...');
      cleanup();
      tryFetch();
    };

    document.head.appendChild(script);
  });
}

// ========= REJESTRACJA UCZESTNIKA - MULTIPLE FALLBACK METHODS =========
// Blokuje przycisk i pokazuje kręciołek na czas zapisu.
// Bez tego użytkownik nie wie, czy kliknięcie zadziałało, i klika drugi raz.
function setRegisterBusy(busy) {
  const btn = document.getElementById('registerBtn');
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.dataset.label || btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Zapisuję...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || 'Zarejestruj się';
  }
}

async function submitRegistration() {
  const form = document.getElementById('registrationForm');
  if (!form) return;

  setRegisterBusy(true);
  try {

  const formData = {
    'Imię': document.getElementById('name').value,
    'Email': document.getElementById('email').value,
    'Telefon': document.getElementById('phone').value,
    'Doświadczenie': document.getElementById('experience').value,
    'Dieta': document.getElementById('diet').value || 'Brak ograniczeń',
    'Data rejestracji': new Date().toISOString(),
    'ID drużyny': ''
  };

  // Walidacja
  if (!formData['Imię'] || !formData['Email'] || !formData['Telefon'] || !formData['Doświadczenie']) {
    showMessage('Wypełnij wszystkie wymagane pola!', 'error');
    return;
  }

  // Sprawdź czy email już istnieje
  if (participants.some(p => p.email === formData['Email'])) {
    showMessage('Ten email jest już zarejestrowany!', 'error');
    return;
  }

  // Sprawdź limit uczestników
  if (participants.length >= CONFIG.MAX_PARTICIPANTS) {
    showMessage(`Osiągnięto maksymalną liczbę uczestników (${CONFIG.MAX_PARTICIPANTS})!`, 'error');
    return;
  }

  // Blokada rejestracji po terminie (niezależnie od licznika w HTML)
  if (new Date() > CONFIG.REGISTRATION_DEADLINE) {
    showMessage('Zapisy zostały już zamknięte!', 'error');
    return;
  }

  // Dodaj lokalnie (optymistyczne podejście)
  const newParticipant = {
    id: Date.now() + Math.random(),
    name: formData['Imię'],
    email: formData['Email'],
    phone: formData['Telefon'],
    experience: formData['Doświadczenie'],
    diet: formData['Dieta'],
    registrationDate: formData['Data rejestracji'],
    teamId: null
  };

  console.log('Wysyłanie danych rejestracji:', formData);

  // Próba 1: JSONP przez GET (najlepsza dla CORS)
  try {
    const result = await sendRegistrationJSONP(formData);
    if (result.status === 'success') {
      participants.push(newParticipant);
      try { localStorage.setItem('grzybobranie_participants', JSON.stringify(participants)); } catch (e) {}

      sendConfirmationEmail(newParticipant);

      form.reset();
      updateParticipantCount();
      loadParticipants();
      showMessage('Zapisano! Sprawdź skrzynkę — wysłaliśmy potwierdzenie.', 'success');
      return;
    }
  } catch (error) {
    console.log('JSONP rejestracja nie powiodła się:', error);
  }

  // Próba 2: Form-encoded POST
  try {
    const formBody = new URLSearchParams();
    formBody.append('action', 'add');
    formBody.append('data', JSON.stringify(formData));

    const response = await fetch(CONFIG.WEB_APP_URL, {
      method: 'POST',
      body: formBody,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const result = await response.json();
    console.log('Form-encoded POST odpowiedź:', result);

    if (result.status === 'success') {
      participants.push(newParticipant);
      try { localStorage.setItem('grzybobranie_participants', JSON.stringify(participants)); } catch (e) {}

      sendConfirmationEmail(newParticipant);

      form.reset();
      updateParticipantCount();
      loadParticipants();
      showMessage('Zapisano! Sprawdź skrzynkę — wysłaliśmy potwierdzenie.', 'success');
      return;
    } else {
      throw new Error(result.error || 'Błąd serwera');
    }

  } catch (error) {
    console.log('Form-encoded POST nie powiodł się:', error);
  }

  // Próba 3: JSON POST (oryginalna metoda)
  try {
    const response = await fetch(CONFIG.WEB_APP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'add',
        data: formData
      })
    });

    const result = await response.json();
    console.log('JSON POST odpowiedź:', result);

    if (result.status === 'success') {
      participants.push(newParticipant);
      try { localStorage.setItem('grzybobranie_participants', JSON.stringify(participants)); } catch (e) {}

      sendConfirmationEmail(newParticipant);

      form.reset();
      updateParticipantCount();
      loadParticipants();
      showMessage('Zapisano! Sprawdź skrzynkę — wysłaliśmy potwierdzenie.', 'success');
      return;
    } else {
      throw new Error(result.error || 'Błąd serwera');
    }

  } catch (error) {
    console.error('JSON POST nie powiódł się:', error);
  }

  // Fallback - zapisz lokalnie
  participants.push(newParticipant);
  localStorage.setItem('grzybobranie_participants', JSON.stringify(participants));

  form.reset();
  updateParticipantCount();
  loadParticipants();

  showMessage('Rejestracja zapisana lokalnie (problem z połączeniem)', 'warning');
  } finally {
    setRegisterBusy(false);
  }
}

// ========= JSONP REGISTRATION METHOD =========
function sendRegistrationJSONP(formData) {
  return new Promise((resolve, reject) => {
    const callbackName = 'regCallback_' + Date.now();
    const script = document.createElement('script');
    
    window[callbackName] = function(data) {
      cleanup();
      resolve(data);
    };
    
    function cleanup() {
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (window[callbackName]) {
        delete window[callbackName];
      }
    }
    
    // Timeout
    setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout'));
    }, 10000);
    
    const dataParam = encodeURIComponent(JSON.stringify(formData));
    script.src = `${CONFIG.WEB_APP_URL}?action=add&data=${dataParam}&callback=${callbackName}`;
    
    script.onerror = function() {
      cleanup();
      reject(new Error('JSONP script error'));
    };
    
    document.head.appendChild(script);
  });
}

// ========= ŁADOWANIE UCZESTNIKÓW DO TABELI =========
function loadParticipants() {
  if (!isAdminMode) return;

  const table = document.querySelector('#participantsTable tbody');
  if (!table) return;

  table.innerHTML = '';

  participants.forEach(participant => {
    const row = table.insertRow();
    const teamName = participant.teamId ?
      (teams.find(t => t.id === participant.teamId)?.name || 'Nieznana drużyna') :
      'Brak';

    row.innerHTML = `
      <td>${participant.name}</td>
      <td>${participant.email}</td>
      <td>${participant.phone}</td>
      <td>${participant.experience}</td>
      <td>${participant.diet}</td>
      <td>${teamName}</td>
      <td>${formatDate(participant.registrationDate)}</td>
      <td>
        <button onclick="removeParticipant('${participant.id}')"
                style="background: #f44336; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">
          Usuń
        </button>
      </td>
    `;
  });
}

// ========= USUWANIE UCZESTNIKA =========
async function removeParticipant(participantId) {
  if (!confirm('Czy na pewno chcesz usunąć tego uczestnika?')) return;

  // Znajdź uczestnika lokalnie
  const participantIndex = participants.findIndex(p => p.id == participantId);
  if (participantIndex === -1) {
    showMessage('Nie znaleziono uczestnika do usunięcia', 'error');
    return;
  }

  const participant = participants[participantIndex];
  console.log('Usuwanie uczestnika:', participant);

  // Użyj email jako główny identyfikator (bardziej niezawodny)
  const participantEmail = participant.email;
  
  try {
    // Próba 1: JSONP przez GET z emailem
    console.log('Próba usunięcia JSONP z email:', participantEmail);
    const result = await removeParticipantJSONP(participantId, participantEmail);
    console.log('JSONP remove result:', result);
    
    if (result.status === 'success') {
      console.log('Uczestnik usunięty z Google Sheets');
      showMessage('Usunięto z Google Sheets', 'success');
    } else {
      throw new Error(result.error || 'Nieznany błąd usuwania');
    }
  } catch (error) {
    console.error('Błąd usuwania z Google Sheets:', error);
    showMessage(`Błąd usuwania z arkusza: ${error.message}`, 'error');
    return; // Nie usuwaj lokalnie jeśli nie udało się usunąć z arkusza
  }

  // Usuń lokalnie tylko po udanym usunięciu z arkusza
  participants.splice(participantIndex, 1);
  localStorage.setItem('grzybobranie_participants', JSON.stringify(participants));

  updateParticipantCount();
  loadParticipants();
  showMessage('Uczestnik został usunięty', 'success');
}

// ========= JSONP REMOVE METHOD - ZAKTUALIZOWANY =========
function removeParticipantJSONP(participantId, participantEmail) {
  return new Promise((resolve, reject) => {
    const callbackName = 'removeCallback_' + Date.now();
    const script = document.createElement('script');
    
    window[callbackName] = function(data) {
      cleanup();
      resolve(data);
    };
    
    function cleanup() {
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (window[callbackName]) {
        delete window[callbackName];
      }
    }
    
    setTimeout(() => {
      cleanup();
      reject(new Error('JSONP remove timeout'));
    }, 10000);
    
    const params = new URLSearchParams({
      action: 'remove',
      id: participantId,
      email: participantEmail,
      token: adminToken,
      callback: callbackName
    });
    
    script.src = `${CONFIG.WEB_APP_URL}?${params.toString()}`;
    script.onerror = function() {
      cleanup();
      reject(new Error('JSONP remove script error'));
    };
    
    document.head.appendChild(script);
  });
}


// Zamienia wiersz z arkusza (polskie naglowki) na obiekt uzywany przez strone
function normalizeParticipant(p) {
  return {
    id: p.ID || p.id || Date.now() + Math.random(),
    name: p['Imię'] || p.name || '',
    email: p['Email'] || p.email || '',
    phone: p['Telefon'] || p.phone || '',
    experience: p['Doświadczenie'] || p.experience || '',
    diet: p['Dieta'] || p.diet || '',
    registrationDate: p['Data rejestracji'] || p.registrationDate || new Date().toISOString(),
    teamId: p['ID drużyny'] || p.teamId || null
  };
}


// Własne okienko na hasło zamiast prompt().
// Powód: prompt() jest blokowany w osadzonych podglądach, a na telefonie
// wygląda jak systemowy alert i łatwo go zignorować.
function askPassword(tytul, placeholder, opts) {
  return new Promise(resolve => {
    const stary = document.getElementById('pwOverlay');
    if (stary) stary.remove();

    const o = document.createElement('div');
    o.id = 'pwOverlay';
    o.innerHTML = `
      <div class="pw-box">
        <div class="pw-title">${tytul}</div>
        <input type="${(opts && opts.type) || 'text'}" id="pwInput"
               placeholder="${placeholder || ''}"
               autocomplete="off" autocapitalize="characters" spellcheck="false">
        ${opts && opts.hint ? `<div class="pw-hint">${opts.hint}</div>` : ''}
        <div class="pw-btns">
          <button class="pw-cancel" id="pwCancel">Anuluj</button>
          <button class="pw-ok" id="pwOk">Dalej</button>
        </div>
      </div>`;
    document.body.appendChild(o);

    const input = document.getElementById('pwInput');
    setTimeout(() => input.focus(), 60);

    function zamknij(wynik) { o.remove(); resolve(wynik); }
    document.getElementById('pwOk').onclick = () => zamknij(input.value.trim() || null);
    document.getElementById('pwCancel').onclick = () => zamknij(null);
    o.onclick = e => { if (e.target === o) zamknij(null); };
    input.onkeydown = e => {
      if (e.key === 'Enter') zamknij(input.value.trim() || null);
      if (e.key === 'Escape') zamknij(null);
    };
  });
}

// ========= PANEL ADMINISTRATORA =========
function toggleAdminMode() {
  if (!isAdminMode) {
    askPassword('🔧 Panel administratora', 'hasło', { type: 'password' }).then(password => {
    if (!password) return;

    showMessage('Sprawdzam hasło...', 'info');

    // Hasło weryfikuje Apps Script, nie przeglądarka.
    jsonpRequest('login', { token: password })
      .then(res => {
        if (res && res.authorized) {
          adminToken = password;
          isAdminMode = true;
          document.getElementById('admin').style.display = 'block';
          document.getElementById('adminLoginBtn').textContent = '🚪 Wyloguj Admin';
          fetchAdminParticipants();
          renderReturnTimeStatus();
          showMessage('Zalogowano jako administrator', 'success');
        } else {
          showMessage('Nieprawidłowe hasło!', 'error');
        }
      })
      .catch(() => showMessage('Brak połączenia z arkuszem. Sprawdź internet.', 'error'));
    });

  } else {
    isAdminMode = false;
    adminToken = '';
    document.getElementById('admin').style.display = 'none';
    document.getElementById('adminLoginBtn').textContent = '🔧 Panel Admina';
    showMessage('Wylogowano z panelu administratora', 'info');
  }
}

// Uniwersalne zapytanie JSONP do Apps Script
function jsonpRequest(action, extraParams) {
  return new Promise((resolve, reject) => {
    const cbName = 'jsonpCb_' + action + '_' + Date.now();
    const script = document.createElement('script');
    let done = false;

    function cleanup() {
      if (script.parentNode) script.parentNode.removeChild(script);
      delete window[cbName];
    }

    window[cbName] = function (data) {
      done = true;
      cleanup();
      resolve(data);
    };

    let qs = '?action=' + encodeURIComponent(action) + '&callback=' + cbName;
    Object.keys(extraParams || {}).forEach(k => {
      qs += '&' + k + '=' + encodeURIComponent(extraParams[k]);
    });

    script.src = CONFIG.WEB_APP_URL + qs;
    script.onerror = function () { cleanup(); reject(new Error('Błąd sieci')); };
    document.head.appendChild(script);

    setTimeout(() => { if (!done) { cleanup(); reject(new Error('Przekroczono czas')); } }, 15000);
  });
}

// Pobiera pełne dane uczestników (z mailami i telefonami) - tylko dla admina
function fetchAdminParticipants() {
  jsonpRequest('getAdmin', { token: adminToken })
    .then(data => {
      if (Array.isArray(data)) {
        participants = data.map(normalizeParticipant);
      }
      loadParticipants();
    })
    .catch(() => loadParticipants());
}

// ========= TWORZENIE DRUŻYN - ZSYNCHRONIZOWANE Z ARKUSZEM =========
async function createTeams() {
  if (participants.length < 3) {
    showMessage('Potrzebujesz minimum 3 uczestników do tworzenia drużyn!', 'error');
    return;
  }

  // Resetuj drużyny
  teams = [];
  participants.forEach(p => p.teamId = null);

  const teamNames = ['Borowiki', 'Podgrzybki', 'Szatany', 'Kanie', 'Kozaki', 'Maślaki',
                     'Rydze', 'Kurki', 'Opieńki', 'Gąski', 'Muchomory', 'Purchawki'];
  let teamIndex = 0;
  let participantsCopy = [...participants].sort(() => Math.random() - 0.5);

  // Twórz drużyny lokalnie
  while (participantsCopy.length > 0) {
    const teamSize = Math.min(4, participantsCopy.length);
    const teamMembers = participantsCopy.splice(0, teamSize);
    const team = {
      id: Date.now() + teamIndex,
      name: teamNames[teamIndex] || `Drużyna ${teamIndex + 1}`,
      members: teamMembers.map(m => m.id),
      leader: teamMembers[0].id
    };
    teams.push(team);
    
    // Przypisz teamId do uczestników
    teamMembers.forEach(member => {
      const participant = participants.find(p => p.id === member.id);
      if (participant) participant.teamId = team.id;
    });
    teamIndex++;
  }

  // Przygotuj dane do wysłania
  const teamsData = {
    teams: teams,
    participants: participants
  };

  console.log('Wysyłanie drużyn do arkusza:', teamsData);

  try {
    // Wyślij do Google Sheets
    const result = await saveTeamsToSheets(teamsData);
    
    if (result.status === 'success') {
      localStorage.setItem('grzybobranie_teams', JSON.stringify(teams));
      localStorage.setItem('grzybobranie_participants', JSON.stringify(participants));
      
      showMessage(`Utworzono ${teams.length} drużyn i zapisano do arkusza!`, 'success');
      loadParticipants();
      displayTeams();
    } else {
      throw new Error(result.error || 'Błąd zapisywania drużyn');
    }
  } catch (error) {
    console.error('Błąd zapisywania drużyn:', error);
    
    // Fallback - zapisz tylko lokalnie
    localStorage.setItem('grzybobranie_teams', JSON.stringify(teams));
    localStorage.setItem('grzybobranie_participants', JSON.stringify(participants));
    
    showMessage(`Utworzono ${teams.length} drużyn (zapisano tylko lokalnie)`, 'warning');
    loadParticipants();
    displayTeams();
  }
}

// ========= ZAPISYWANIE DRUŻYN DO ARKUSZA =========
function saveTeamsToSheets(teamsData) {
  return new Promise((resolve, reject) => {
    const callbackName = 'teamsCallback_' + Date.now();
    const script = document.createElement('script');
    
    window[callbackName] = function(data) {
      cleanup();
      resolve(data);
    };
    
    function cleanup() {
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (window[callbackName]) {
        delete window[callbackName];
      }
    }
    
    setTimeout(() => {
      cleanup();
      reject(new Error('Timeout zapisywania drużyn'));
    }, 15000);
    
    const dataParam = encodeURIComponent(JSON.stringify(teamsData));
    script.src = `${CONFIG.WEB_APP_URL}?action=createTeams&teamsData=${dataParam}&token=${encodeURIComponent(adminToken)}&callback=${callbackName}`;
    
    script.onerror = function() {
      cleanup();
      reject(new Error('Błąd skryptu zapisywania drużyn'));
    };
    
    document.head.appendChild(script);
  });
}

// ========= POBIERANIE DRUŻYN Z ARKUSZA =========
async function fetchTeamsFromSheet() {
  try {
    console.log('Pobieranie drużyn z arkusza...');
    const response = await fetch(CONFIG.WEB_APP_URL + '?action=getTeams');
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      teams = data.map(team => ({
        id: team.id,
        name: team.name,
        leader: team.leader,
        members: Array.isArray(team.members) ? team.members : 
                (team.members ? team.members.split(',').map(id => id.trim()) : [])
      }));
      
      localStorage.setItem('grzybobranie_teams', JSON.stringify(teams));
      displayTeams();
      console.log('Pobrano drużyny z arkusza:', teams);
      return teams;
    }
  } catch (error) {
    console.error('Błąd pobierania drużyn:', error);
  }
  
  return [];
}

// ========= WYŚWIETLANIE DRUŻYN =========
function displayTeams() {
  const container = document.getElementById('teamsContainer');
  if (!container) return;

  container.innerHTML = '<h2>Drużyny Grzybobrania</h2>';

  if (teams.length === 0) {
    container.innerHTML += '<p>Drużyny nie zostały jeszcze utworzone.</p>';
    try { renderPhotoUploadForm(); } catch (e) {}
    try { updateMissionsTabVisibility(); } catch (e) {}
    return;
  }

  teams.forEach(team => {
    // ID z arkusza wracają jako tekst, lokalne jako liczby - porównujemy jako tekst
    const members = team.members.map(id => {
      const p = participants.find(p => String(p.id) === String(id));
      return p ? p.name : 'Nieznany';
    }).join(', ');
    const leader = participants.find(p => String(p.id) === String(team.leader));
    const leaderName = leader ? leader.name : 'Nieznany';
    const div = document.createElement('div');
    div.style.cssText = 'background: white; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #2d5016;';
    div.innerHTML = `
      <h4 style="margin: 0 0 10px 0; color: #2d5016;">${team.name}</h4>
      <p style="margin: 5px 0;"><strong>Lider:</strong> ${leaderName}</p>
      <p style="margin: 5px 0;"><strong>Członkowie:</strong> ${members}</p>
    `;
    container.appendChild(div);
  });

  // Odśwież listy zależne od drużyn
  try { renderPhotoUploadForm(); } catch (e) {}
  try { updateMissionsTabVisibility(); } catch (e) {}
  try { if (isJudgeMode) renderJudgeTeamPicker(); } catch (e) {}
}

// ========= EMAIL =========
async function sendTeamEmails() {
  if (teams.length === 0) {
    showMessage('Najpierw utwórz drużyny!', 'error');
    return;
  }

  // Kody kapitanów są w arkuszu - pobieramy je przed wysyłką
  let kody = {};
  try {
    const dane = await jsonpRequest('getCaptainCodes', { token: adminToken });
    if (Array.isArray(dane)) {
      dane.forEach(d => { kody[String(d.teamId)] = d.code; });
    }
  } catch (e) {
    showMessage('Nie udało się pobrać kodów kapitanów — maile pójdą bez nich.', 'warning');
  }

  // Kody drużyn - do wysyłania zdjęć. Dostają je wszyscy członkowie.
  let kodyDruzyn = {};
  try {
    const dane = await jsonpRequest('getTeamCodes', { token: adminToken });
    if (Array.isArray(dane)) {
      dane.forEach(d => { kodyDruzyn[String(d.teamId)] = d.teamCode; });
    }
  } catch (e) {
    showMessage('Nie udało się pobrać kodów drużyn — maile pójdą bez nich.', 'warning');
  }

  for (const team of teams) {
    for (const memberId of team.members) {
      const participant = participants.find(p => String(p.id) === String(memberId));
      if (!participant) continue;

      const jestKapitanem = String(team.leader) === String(memberId);
      const kod = kody[String(team.id)] || '';

      const emailParams = {
        to_name: participant.name,
        to_email: participant.email,
        team_name: team.name,
        team_members: team.members.map(id => {
          const m = participants.find(p => String(p.id) === String(id));
          return m ? m.name : 'Nieznany';
        }).join(', '),
        event_date: CONFIG.EVENT_DATE_TEXT,
        meeting_point: CONFIG.MEETING_POINT_TEXT,
        // Puste dla zwyklych czlonkow - w szablonie linia po prostu zniknie
        captain_role: jestKapitanem ? 'Jesteś KAPITANEM tej drużyny.' : '',
        captain_code: jestKapitanem ? kod : '',
        // Kod drużyny dostają WSZYSCY - służy do wysyłania zdjęć z misji
        team_code: kodyDruzyn[String(team.id)] || ''
      };
      try {
        await emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_TEMPLATE_ID, emailParams);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Błąd wysyłania email do:', participant.email, error);
      }
    }
  }
  showMessage('Wysłano emaile do uczestników!', 'success');
}

// ========= FUNKCJE TESTOWE =========
function testEmail() {
  console.log("📧 Test Email - funkcja testowa");
  showMessage('Funkcja testowa email - sprawdź console', 'info');
}

function debugPost() {
  console.log("🔧 debugPost: funkcja testowa, brak implementacji.");
}

function debugGoogleSheets() {
  console.log("📊 Debug Google Sheets");
  console.log("URL:", CONFIG.WEB_APP_URL);
  console.log("Participants:", participants);

  // Test różnych metod
  fetch(CONFIG.WEB_APP_URL + '?action=test')
    .then(res => res.text())
    .then(text => console.log("Fetch test response:", text))
    .catch(err => console.error("Fetch test error:", err));
}

// ========= START =========
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🍄 Inicjalizacja aplikacji Grzybobranie...');

  // Ładowanie danych z localStorage
  let stored = null;
  try { stored = localStorage.getItem('grzybobranie_participants'); } catch (e) {}
  if (stored) {
    try {
      participants = JSON.parse(stored);
      console.log('Załadowano uczestników z localStorage:', participants.length);
    } catch (e) {
      console.error('Błąd ładowania z localStorage:', e);
      participants = [];
    }
  }

  let storedTeams = null;
  try { storedTeams = localStorage.getItem('grzybobranie_teams'); } catch (e) {}
  if (storedTeams) {
    try {
      teams = JSON.parse(storedTeams);
      console.log('Załadowano drużyny z localStorage:', teams.length);
      displayTeams();
    } catch (e) {
      console.error('Błąd ładowania drużyn z localStorage:', e);
      teams = [];
    }
  }

  updateParticipantCount();

  // Nowe moduły: karta misji, galeria, wysyłka zdjęć
  renderMissionCard();
  renderGallery();
  renderPhotoUploadForm();
  updateMissionsTabVisibility();
  loadMissionPhotos();
  loadEventSettings();
  loadWeather();

  // Spróbuj pobrać aktualne dane z Google Sheets
  try {
    await fetchParticipantsFromSheet();
    await fetchTeamsFromSheet(); // Dodaj pobieranie drużyn
  } catch (error) {
    console.log('Nie udało się pobrać danych z Google Sheets');
  }

  console.log('✅ Aplikacja gotowa!');
});

// ========= GLOBALNE FUNKCJE =========
window.showTab = showTab;
window.submitRegistration = submitRegistration;
window.toggleAdminMode = toggleAdminMode;
window.removeParticipant = removeParticipant;
window.createTeams = createTeams;
window.sendTeamEmails = sendTeamEmails;
window.testEmail = testEmail;
window.debugGoogleSheets = debugGoogleSheets;
window.debugPost = debugPost;
window.fetchTeamsFromSheet = fetchTeamsFromSheet;

// ================= KARTY MISJI =================
// Wartości punktowe są celowo nierówne (3,4,5,6,7,8,9,11,13,17)
// - dzięki temu dwie drużyny rzadko uzbierają identyczną sumę.
// Możesz dowolnie zmieniać teksty i punkty. Suma maksymalna liczy się sama.

const MISSIONS = [
  { id: 'm1',  cat: 'A', pts: 13, title: 'Borowik szlachetny',
    desc: 'Wystarczy jedna sztuka w koszu. Król lasu, król punktów.',
    foto: 'borowik.jpg' },
  { id: 'm2',  cat: 'A', pts: 11, title: 'Kurka',
    desc: 'Jedna sztuka. Żółta, pachnąca, trudna do pomylenia.',
    foto: 'kurka.jpg' },
  { id: 'm3',  cat: 'A', pts: 9,  title: 'Koźlarz',
    desc: 'Babka lub czerwony — obojętnie który.',
    foto: 'kozlarz.jpg' },
  { id: 'm4',  cat: 'A', pts: 7,  title: 'Podgrzybek',
    desc: 'Jedna sztuka. Zwykle najłatwiejsze punkty dnia.',
    foto: 'podgrzybek.jpg' },
  { id: 'm5',  cat: 'A', pts: 5,  title: 'Maślak',
    desc: 'Jedna sztuka. Śliski kapelusz zdradza go od razu.',
    foto: 'maslak.jpg' },
  { id: 'm6',  cat: 'A', pts: 17, title: 'Pięć różnych gatunków jadalnych',
    desc: 'Najcenniejsza misja dnia. Liczą się gatunki, nie sztuki.' },

  { id: 'm7',  cat: 'B', pts: 6,  title: 'Muchomor czerwony — TYLKO zdjęcie',
    desc: 'Nie zbieramy, nie dotykamy, nie kopiemy. Zdjęcie i idziemy dalej.',
    foto: 'muchomor.jpg' },
  { id: 'm8',  cat: 'B', pts: 4,  title: 'Grzyb rosnący na drzewie lub pniu',
    desc: 'Huba też się liczy. Zdjęcie wystarczy.' },
  { id: 'm9',  cat: 'B', pts: 3,  title: 'Zdjęcie drużyny w komplecie',
    desc: 'Wszyscy w kadrze, w lesie. Selfie z wyciągniętej ręki jak najbardziej.' },
  { id: 'm13', cat: 'B', pts: 8,  title: 'Dzikie zwierzę leśne',
    desc: 'Sarna, dzik, lis, wiewiórka, zając, ptak. Z bezpiecznej odległości — ' +
          'nie podchodzimy, nie zaganiamy. Rozmazane zdjęcie umykającej sarny też się liczy.' },

  { id: 'm11', cat: 'C', pts: 6,  title: 'Cztery skarby lasu',
    desc: 'Żołądź, szyszka, kolorowy liść i piórko. Wszystkie cztery naraz.' },
  { id: 'm12', cat: 'C', pts: 10, title: 'Miss Kapelusza',
    desc: 'Wystawiacie jednego najładniejszego grzyba. Każdy kapitan ocenia go od 0 do 10 pkt, ' +
          'z pominięciem własnej drużyny. To jedyna ocena uznaniowa i najczęściej rozstrzyga remisy.',
    judged: true }
];

const PENALTIES = [
  { pts: -15, title: 'Grzyb trujący w koszu',        desc: 'Za każdą sztukę. Bezpieczeństwo przede wszystkim.' },
  { pts: -10, title: 'Reklamówka zamiast koszyka',   desc: 'Grzyby w plastiku się parzą. Koszyk obowiązkowy.' },
  { pts: -2,  title: 'Spóźnienie',                   desc: 'Za każdą rozpoczętą minutę po godzinie powrotu.' }
];

const CAT_NAMES = {
  A: { icon: '🧺', name: 'ŁOWY', hint: 'Komisja zagląda do koszyka' },
  B: { icon: '📷', name: 'OKO',  hint: 'Przesyłacie w zakładce „Wyślij zdjęcia”' },
  C: { icon: '🎭', name: 'FANTAZJA', hint: 'Ocenia komisja sędziowska' }
};

// Stan zaznaczeń - tylko w pamięci przeglądarki, znika po odświeżeniu.
// To celowe: kartę drukujecie na papierze, bo w lesie i tak nie ma zasięgu.
let missionState = {};
let missBeautyScore = 0;

function missionTotal() {
  let sum = 0;
  MISSIONS.forEach(m => {
    if (m.judged) return;
    if (missionState[m.id]) sum += m.pts;
  });
  sum += missBeautyScore;
  return sum;
}

function missionMax() {
  return MISSIONS.reduce((s, m) => s + m.pts, 0);
}

// Zdjęcie rozwija się po kliknięciu ikonki, nie po najechaniu myszą.
// Na telefonie najechania nie ma, a to na telefonach będzie używane najczęściej.
function toggleMissionFoto(id) {
  const box = document.getElementById('foto_' + id);
  if (box) box.style.display = (box.style.display === 'none') ? 'block' : 'none';
}

function toggleMission(id) {
  missionState[id] = !missionState[id];
  renderMissionCard();
}

function setBeautyScore(v) {
  missBeautyScore = parseInt(v, 10) || 0;
  renderMissionCard();
}

function resetMissions() {
  missionState = {};
  missBeautyScore = 0;
  renderMissionCard();
}

function renderMissionCard() {
  const box = document.getElementById('missionCard');
  if (!box) return;

  let html = '';

  ['A', 'B', 'C'].forEach(cat => {
    const c = CAT_NAMES[cat];
    html += `<div class="mission-cat">
               <div class="mission-cat-head">
                 <span>${c.icon} ${c.name}</span>
                 <small>${c.hint}</small>
               </div>`;

    MISSIONS.filter(m => m.cat === cat).forEach(m => {
      if (m.judged) {
        html += `
          <div class="mission-row judged">
            <div class="mission-body">
              <div class="mission-title">${m.title}
                <span class="mission-pts">0–${m.pts} pkt</span></div>
              <div class="mission-desc">${m.desc}</div>
              <div class="beauty-picker no-print">
                <label>Ocena komisji:</label>
                <select onchange="setBeautyScore(this.value)">
                  ${[0,1,2,3,4,5,6,7,8,9,10].map(n =>
                    `<option value="${n}" ${n === missBeautyScore ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
              </div>
              <div class="print-only print-line">Ocena: ____ / 10</div>
            </div>
          </div>`;
      } else {
        const on = !!missionState[m.id];
        html += `
          <div class="mission-row ${on ? 'done' : ''}">
            <div class="mission-check" onclick="toggleMission('${m.id}')">${on ? '✔' : ''}</div>
            <div class="mission-body" onclick="toggleMission('${m.id}')">
              <div class="mission-title">${m.title}
                <span class="mission-pts">${m.pts} pkt</span></div>
              <div class="mission-desc">${m.desc}</div>
            </div>
            ${m.foto ? `<button class="foto-btn" title="Pokaż zdjęcie"
                 onclick="event.stopPropagation(); toggleMissionFoto('${m.id}')">📷</button>` : ''}
          </div>
          ${m.foto ? `<div class="foto-box" id="foto_${m.id}" style="display:none">
              <img src="zdjecia/grzyby/${m.foto}" alt="${m.title}"
                   onerror="this.parentNode.innerHTML='<p class=&quot;foto-brak&quot;>Zdjęcie zostanie dodane wkrótce.</p>'">
              <p class="foto-uwaga">Zdjęcie poglądowe. <strong>Nie służy do rozpoznawania,
                 czy grzyb jest jadalny</strong> — w razie wątpliwości nie zbieramy.</p>
            </div>` : ''}`;
      }
    });

    html += `</div>`;
  });

  html += `<div class="mission-cat penalties">
             <div class="mission-cat-head"><span>⛔ KARY</span><small>Oby nie były potrzebne</small></div>`;
  PENALTIES.forEach(p => {
    html += `<div class="mission-row penalty">
               <div class="mission-check">−</div>
               <div class="mission-body">
                 <div class="mission-title">${p.title}
                   <span class="mission-pts neg">${p.pts} pkt</span></div>
                 <div class="mission-desc">${p.desc}</div>
               </div>
             </div>`;
  });
  html += `</div>`;

  box.innerHTML = html;

  const t = document.getElementById('missionTotal');
  if (t) t.textContent = missionTotal();
  const mx = document.getElementById('missionMax');
  if (mx) mx.textContent = missionMax();
}

// Drukowanie: jedna karta na drużynę, każda na osobnej stronie
function printMissionCards() {
  const names = teams.length
    ? teams.map(t => t.name)
    : ['Drużyna 1', 'Drużyna 2', 'Drużyna 3', 'Drużyna 4', 'Drużyna 5', 'Drużyna 6'];

  let pages = '';
  names.forEach(name => {
    let rows = '';
    ['A', 'B', 'C'].forEach(cat => {
      const c = CAT_NAMES[cat];
      rows += `<tr class="cat"><td colspan="3">${c.icon} ${c.name}</td></tr>`;
      MISSIONS.filter(m => m.cat === cat).forEach(m => {
        rows += `<tr>
                   <td class="box">${m.judged ? '' : '☐'}</td>
                   <td><b>${m.title}</b><br><span class="d">${m.desc}</span></td>
                   <td class="p">${m.judged ? '__/' + m.pts : m.pts}</td>
                 </tr>`;
      });
    });
    rows += `<tr class="cat"><td colspan="3">⛔ KARY</td></tr>`;
    PENALTIES.forEach(p => {
      rows += `<tr><td class="box">☐</td><td><b>${p.title}</b><br><span class="d">${p.desc}</span></td>
               <td class="p">${p.pts}</td></tr>`;
    });

    pages += `
      <div class="page">
        <h1>🍄 KARTA MISJI</h1>
        <h2>${name}</h2>
        <table>${rows}</table>
        <div class="foot">
          <div>Godzina powrotu: __________</div>
          <div>SUMA PUNKTÓW: __________</div>
          <div class="sig">Podpis przewodniczącego komisji: ______________________</div>
        </div>
      </div>`;
  });

  const w = window.open('', '_blank');
  if (!w) {
    showMessage('Przeglądarka zablokowała nowe okno. Zezwól na wyskakujące okienka.', 'error');
    return;
  }
  w.document.write(`<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8">
    <title>Karty misji — Grzybobranie 2026</title><style>
    body{font-family:Arial,sans-serif;margin:0;color:#000}
    .page{padding:16mm;page-break-after:always}
    .page:last-child{page-break-after:auto}
    h1{margin:0;font-size:20pt;text-align:center}
    h2{margin:2mm 0 6mm;font-size:16pt;text-align:center;border-bottom:2px solid #000;padding-bottom:3mm}
    table{width:100%;border-collapse:collapse;font-size:10pt}
    td{border-bottom:1px solid #bbb;padding:2.5mm 2mm;vertical-align:top}
    tr.cat td{background:#e8e8e8;font-weight:bold;font-size:11pt;border-bottom:1.5px solid #000}
    .box{width:8mm;font-size:15pt;text-align:center;line-height:1}
    .p{width:16mm;text-align:right;font-weight:bold;white-space:nowrap}
    .d{font-size:8.5pt;color:#555}
    .foot{margin-top:8mm;font-size:12pt;line-height:2.2}
    .sig{margin-top:6mm}
    @page{size:A4;margin:0}
    </style></head><body>${pages}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ================= GALERIA: TAK BYŁO W ZESZŁYM ROKU =================

function renderGallery() {
  const box = document.getElementById('galleryGrid');
  if (!box) return;

  if (!GALLERY_PHOTOS.length) {
    box.innerHTML = `<p class="gallery-empty">
      Zdjęcia z I edycji pojawią się tutaj wkrótce. 📷</p>`;
    return;
  }

  box.innerHTML = GALLERY_PHOTOS.map((ph, i) => `
    <figure class="gallery-item" onclick="openLightbox(${i})">
      <img src="zdjecia/${ph.file}" alt="${ph.caption || 'Grzybobranie 2025'}" loading="lazy">
      ${ph.caption ? `<figcaption>${ph.caption}</figcaption>` : ''}
    </figure>`).join('');
}

let lightboxIndex = 0;

function openLightbox(i) {
  lightboxIndex = i;
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  const ph = GALLERY_PHOTOS[i];
  document.getElementById('lightboxImg').src = 'zdjecia/' + ph.file;
  document.getElementById('lightboxCap').textContent = ph.caption || '';
  lb.style.display = 'flex';
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.style.display = 'none';
}

function moveLightbox(step) {
  if (!GALLERY_PHOTOS.length) return;
  lightboxIndex = (lightboxIndex + step + GALLERY_PHOTOS.length) % GALLERY_PHOTOS.length;
  openLightbox(lightboxIndex);
}

document.addEventListener('keydown', function (e) {
  const lb = document.getElementById('lightbox');
  if (!lb || lb.style.display !== 'flex') return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') moveLightbox(1);
  if (e.key === 'ArrowLeft') moveLightbox(-1);
});

// ================= MAIL POTWIERDZAJĄCY ZAPIS =================

function sendConfirmationEmail(participant) {
  if (typeof emailjs === 'undefined' || !CONFIG.EMAILJS_TEMPLATE_CONFIRM) return;

  const deadline = CONFIG.REGISTRATION_DEADLINE.toLocaleDateString('pl-PL', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  // Adres bazowy strony, np. https://grzybobranie.pages.dev/
  // Obcinamy nazwe pliku, zeby dzialalo i przy /index.html, i przy samym /
  let baseUrl = window.location.origin +
                window.location.pathname.replace(/[^/]*$/, '');
  if (CONFIG.SITE_URL_OVERRIDE) baseUrl = CONFIG.SITE_URL_OVERRIDE;

  const params = {
    to_name: participant.name,
    to_email: participant.email,
    event_date: CONFIG.EVENT_DATE_TEXT,
    meeting_point: CONFIG.MEETING_POINT_TEXT,
    deadline_date: deadline,
    experience: participant.experience,
    diet: participant.diet || 'brak ograniczeń',
    site_url: baseUrl,
    photo_url: baseUrl + 'mail-foto.jpg'
  };

  emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_TEMPLATE_CONFIRM, params)
    .then(() => console.log('Mail potwierdzający wysłany do', participant.email))
    .catch(err => console.error('Nie udało się wysłać potwierdzenia:', err));
}

window.toggleMission = toggleMission;
window.setBeautyScore = setBeautyScore;
window.resetMissions = resetMissions;
window.printMissionCards = printMissionCards;
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.moveLightbox = moveLightbox;

// ================= KOMISJA SEDZIOWSKA =================
// Kapitanowie loguja sie wspolnym haslem sedziowskim i razem
// wypelniaja karte kazdej druzyny. Wyniki ida prosto do arkusza.

let isJudgeMode = false;
let judgeToken = '';
let judgeName = '';
let currentJudgedTeam = null;
let judgeOwnTeam = null;    // drużyna zalogowanego kapitana
let judgeIsAdmin = false;
let judgeIsChairman = false;   // przewodniczący odhacza misje, reszta tylko głosuje
let myBeautyVotes = {};     // {teamId: ocena} - głosy zalogowanego kapitana
let judgeState = {};      // { teamId: {missions:{}, beauty:0, weight:'', penalties:0, returnTime:''} }
let missionPhotos = [];   // zdjecia wgrane przez druzyny

const PHOTO_MISSIONS = ['m7', 'm8', 'm9', 'm13'];   // misje wymagajace zdjecia

// Kod druzyny podany na czas sesji. Znika po odswiezeniu strony.
let photoTeamCode = '';
let photoTeamId = null;
let photoTeamName = '';

function judgeStateFor(teamId) {
  if (!judgeState[teamId]) {
    judgeState[teamId] = { missions: {}, beauty: 0, weight: '', penalties: 0, returnTime: '' };
  }
  return judgeState[teamId];
}

// ---------- LOGOWANIE ----------

function toggleJudgeMode() {
  if (isJudgeMode) {
    isJudgeMode = false;
    judgeToken = '';
    judgeOwnTeam = null;
    judgeIsAdmin = false;
    judgeIsChairman = false;
    myBeautyVotes = {};
    currentJudgedTeam = null;
    document.getElementById('judgePanel').style.display = 'none';
    document.getElementById('judgeLoginBox').style.display = 'block';
    document.getElementById('judgeLoginBtn').textContent = '🔑 Zaloguj komisję';
    showMessage('Komisja wylogowana', 'info');
    return;
  }

  askPassword('⚖️ Logowanie kapitana', 'np. K7MPQ4',
              { hint: 'Sześcioznakowy kod z maila z przydziałem drużyny.' }).then(kod => {
  if (!kod) return;

  showMessage('Sprawdzam kod...', 'info');

  jsonpRequest('judgeLogin', { token: kod.trim().toUpperCase() })
    .then(res => {
      if (res && res.authorized) {
        judgeToken = kod.trim().toUpperCase();
        judgeName = res.captainName || 'kapitan';
        judgeOwnTeam = res.teamId;          // swojej drużyny nie ocenia
        judgeIsAdmin = !!res.isAdmin;
        judgeIsChairman = !!res.isChairman;
        isJudgeMode = true;

        document.getElementById('judgeLoginBox').style.display = 'none';
        document.getElementById('judgePanel').style.display = 'block';
        document.getElementById('judgeLoginBtn').textContent = '🚪 Wyloguj komisję';

        const kto = document.getElementById('judgeWhoami');
        if (kto) {
          if (judgeIsAdmin) {
            kto.innerHTML = '👤 <b>Organizator</b> — pełny dostęp do wszystkich drużyn.';
          } else if (judgeIsChairman) {
            kto.innerHTML = `👤 <b>${judgeName}</b> · drużyna <b>${res.teamName}</b>
              <br>🎖️ <b>Przewodniczący komisji</b> — odhaczasz misje, wpisujesz wagę i kary
              dla wszystkich drużyn oraz głosujesz na Miss Kapelusza.
              <br>Własnej drużyny nie oceniasz.`;
          } else {
            kto.innerHTML = `👤 <b>${judgeName}</b> · drużyna <b>${res.teamName}</b>
              <br>Głosujesz na <b>Miss Kapelusza</b> dla pozostałych drużyn.
              Misje i wagę odhacza przewodniczący komisji.`;
          }
        }

        loadMissionPhotos();
        loadScoresFromSheet();
        loadMyVotes();
        renderJudgeTeamPicker();
        showMessage(`Witaj w komisji, ${judgeName}!`, 'success');
      } else {
        showMessage('Nieprawidłowy kod kapitana!', 'error');
      }
    })
    .catch(() => showMessage('Brak połączenia z arkuszem.', 'error'));
  });
}

// ---------- WYBOR DRUZYNY ----------

function renderJudgeTeamPicker() {
  const box = document.getElementById('judgeTeamPicker');
  if (!box) return;

  if (!teams.length) {
    box.innerHTML = '<p class="gallery-empty">Drużyny nie są jeszcze wylosowane.</p>';
    document.getElementById('judgeCard').innerHTML = '';
    return;
  }

  box.innerHTML = teams.map(t => {
    const zapisany = savedScores.some(s => String(s['ID drużyny']) === String(t.id));
    const wlasna = !judgeIsAdmin && String(t.id) === String(judgeOwnTeam);

    if (wlasna) {
      return `<button class="judge-team-btn own" disabled
                title="Twoją drużynę oceniają pozostali kapitanowie">
                ${t.name} 🔒${zapisany ? ' ✔' : ''}
              </button>`;
    }
    return `<button class="judge-team-btn ${String(currentJudgedTeam) === String(t.id) ? 'active' : ''} ${zapisany ? 'done' : ''}"
              onclick="selectJudgedTeam(${t.id})">
              ${t.name}${zapisany ? ' ✔' : ''}
            </button>`;
  }).join('');

  renderScoreboard();
}

function selectJudgedTeam(teamId) {
  if (!judgeIsAdmin && String(teamId) === String(judgeOwnTeam)) {
    showMessage('Własnej drużyny nie oceniasz — poproś innego kapitana.', 'error');
    return;
  }
  currentJudgedTeam = teamId;
  renderJudgeTeamPicker();
  renderJudgeCard();
}

// ---------- KARTA OCENY ----------

function renderJudgeCard() {
  const box = document.getElementById('judgeCard');
  if (!box) return;

  const team = teams.find(t => String(t.id) === String(currentJudgedTeam));
  if (!team) { box.innerHTML = ''; return; }

  const st = judgeStateFor(team.id);
  const pelny = judgeIsChairman || judgeIsAdmin;
  let html = `<h3 class="judge-team-title">🧺 ${team.name}</h3>`;

  // Zwykły kapitan głosuje wyłącznie na Miss Kapelusza
  if (!pelny) {
    const m = MISSIONS.filter(x => x.judged)[0];
    const mojGlos = myBeautyVotes[String(team.id)];
    const wynik = savedScores.filter(s => String(s['ID drużyny']) === String(team.id))[0];
    const ilu = wynik ? Number(wynik['Głosów Miss'] || 0) : 0;

    html += `
      <div class="mission-cat">
        <div class="mission-cat-head"><span>👑 MISS KAPELUSZA</span><small>Twój głos</small></div>
        <div class="mission-row judged">
          <div class="mission-body">
            <div class="mission-desc">${m ? m.desc : ''}</div>
            <div class="vote-box">
              <div class="vote-label">Twój głos${mojGlos !== undefined ? ' (oddany)' : ''}:</div>
              <div class="vote-scale">
                ${[0,1,2,3,4,5,6,7,8,9,10].map(n =>
                  `<button class="vote-btn ${mojGlos === n ? 'picked' : ''}"
                           onclick="castBeautyVote(${team.id}, ${n})">${n}</button>`).join('')}
              </div>
              <div class="vote-status">
                ${ilu ? `Oddano <b>${ilu}</b> ${ilu === 1 ? 'głos' : (ilu < 5 ? 'głosy' : 'głosów')}
                         · wynik drużyny: <b>${wynik['Miss Kapelusza']}</b> pkt`
                      : 'Nikt jeszcze nie zagłosował na tę drużynę.'}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="note-box">
        Misje, wagę i kary wpisuje <strong>przewodniczący komisji</strong>.
        Ty głosujesz tylko na Miss Kapelusza.
      </div>`;

    box.innerHTML = html;
    return;
  }

  ['A', 'B', 'C'].forEach(cat => {
    const c = CAT_NAMES[cat];
    html += `<div class="mission-cat">
               <div class="mission-cat-head"><span>${c.icon} ${c.name}</span><small>${c.hint}</small></div>`;

    MISSIONS.filter(m => m.cat === cat).forEach(m => {
      if (m.judged) {
        const mojGlos = myBeautyVotes[String(team.id)];
        const wynik = savedScores.filter(s => String(s['ID drużyny']) === String(team.id))[0];
        const ilu = wynik ? Number(wynik['Głosów Miss'] || 0) : 0;
        const srednia = wynik ? wynik['Miss Kapelusza'] : null;

        html += `
          <div class="mission-row judged">
            <div class="mission-body">
              <div class="mission-title">${m.title}<span class="mission-pts">0–${m.pts} pkt</span></div>
              <div class="mission-desc">${m.desc}</div>

              <div class="vote-box">
                <div class="vote-label">Twój głos${mojGlos !== undefined ? ' (oddany)' : ''}:</div>
                <div class="vote-scale">
                  ${[0,1,2,3,4,5,6,7,8,9,10].map(n =>
                    `<button class="vote-btn ${mojGlos === n ? 'picked' : ''}"
                             onclick="castBeautyVote(${team.id}, ${n})">${n}</button>`).join('')}
                </div>
                <div class="vote-status">
                  ${ilu
                    ? `Oddano <b>${ilu}</b> ${ilu === 1 ? 'głos' : (ilu < 5 ? 'głosy' : 'głosów')} ·
                       wynik drużyny: <b>${srednia}</b> pkt
                       ${wynik['Miss obcięta'] ? '<span class="vote-trim">(średnia bez skrajnych ocen)</span>' : ''}`
                    : 'Nikt jeszcze nie zagłosował na tę drużynę.'}
                </div>
              </div>
            </div>
          </div>`;
      } else {
        const on = !!st.missions[m.id];
        const foty = missionPhotos.filter(p =>
          String(p.teamId) === String(team.id) && p.missionId === m.id);

        html += `
          <div class="mission-row ${on ? 'done' : ''}">
            <div class="mission-check" onclick="toggleJudgeMission(${team.id}, '${m.id}')">${on ? '✔' : ''}</div>
            <div class="mission-body" onclick="toggleJudgeMission(${team.id}, '${m.id}')">
              <div class="mission-title">${m.title}<span class="mission-pts">${m.pts} pkt</span></div>
              <div class="mission-desc">${m.desc}</div>
            </div>`;

        html += `</div>`;

        if (PHOTO_MISSIONS.indexOf(m.id) !== -1) {
          html += foty.length
            ? `<div class="photo-check">${foty.map(f => {
                const flagi = ocenZdjecie(f.exif);
                return `<div class="pc-item">
                    <a href="${f.full}" target="_blank" rel="noopener">
                      <img src="${f.thumb}" alt="Zdjęcie drużyny"></a>
                    <div class="pc-flags">${flagi.map(fl =>
                      `<span class="pc-flag pc-${fl.typ}">${
                        fl.typ === 'ok' ? '✓' : fl.typ === 'zle' ? '⚠' : 'ℹ'
                      } ${fl.tekst}</span>`).join('')}</div>
                  </div>`;
              }).join('')}</div>`
            : `<div class="photo-check"><div class="judge-nophoto">brak zdjęcia</div></div>`;
        }
      }
    });
    html += `</div>`;
  });

  // waga + kary + czas
  html += `
    <div class="mission-cat">
      <div class="mission-cat-head"><span>⚖️ WAGA I KARY</span><small>Wpisuje komisja</small></div>

      <div class="judge-field">
        <label>Waga zbioru (kg)</label>
        <input type="number" step="0.01" min="0" inputmode="decimal"
               value="${st.weight}" placeholder="np. 3,47"
               oninput="setJudgeWeight(${team.id}, this.value)">
        <span class="judge-hint">1 kg = 1 pkt, zaokrąglane do 0,1 kg &rarr;
          <strong id="wagaPkt_${team.id}">${formatWeightPoints(st.weight)}</strong> pkt</span>
      </div>

      <div class="judge-field">
        <label>Kary (punkty ujemne)</label>
        <input type="number" step="1" min="0" value="${st.penalties}"
               oninput="setJudgePenalties(${team.id}, this.value)">
        <span class="judge-hint">Trujący grzyb −15 &middot; reklamówka −10 &middot; spóźnienie −2/min</span>
      </div>

      <div class="judge-field">
        <label>Godzina powrotu</label>
        <input type="time" value="${st.returnTime}"
               oninput="setJudgeReturn(${team.id}, this.value)">
        <span class="judge-hint">Rozstrzyga przy remisie</span>
      </div>
    </div>

    <div class="judge-summary">
      <div>Misje: <b>${judgeMissionPoints(team.id)}</b></div>
      <div>Miss Kapelusza: <b>${missOf(team.id)}</b></div>
      <div>Waga: <b>${formatWeightPoints(st.weight)}</b></div>
      <div>Kary: <b>−${st.penalties || 0}</b></div>
      <div class="judge-total">SUMA: <b>${judgeTotal(team.id)}</b></div>
    </div>

    <button class="mission-btn primary judge-save" onclick="saveJudgeScore(${team.id})">
      💾 Zapisz wynik drużyny ${team.name}
    </button>`;

  box.innerHTML = html;
}

// ---------- LICZENIE ----------

// Wynik Miss Kapelusza dla drużyny - zawsze z arkusza, nigdy lokalnie
function missOf(teamId) {
  const w = savedScores.filter(s => String(s['ID drużyny']) === String(teamId))[0];
  return w ? Number(w['Miss Kapelusza'] || 0) : 0;
}

function judgeMissionPoints(teamId) {
  const st = judgeStateFor(teamId);
  let s = 0;
  MISSIONS.forEach(m => { if (!m.judged && st.missions[m.id]) s += m.pts; });
  return s;
}

// Zaokraglenie do 0,1 kg wg zasad matematycznych
function formatWeightPoints(kg) {
  const l = parseFloat(String(kg).replace(',', '.'));
  if (isNaN(l) || l < 0) return 0;
  // + EPSILON, bo bez tego 3,45 zaokragla sie w dol (blad liczb zmiennoprzecinkowych)
  return Math.round((l + Number.EPSILON) * 10) / 10;
}

function judgeTotal(teamId) {
  const st = judgeStateFor(teamId);
  const wynik = savedScores.filter(s => String(s['ID drużyny']) === String(teamId))[0];
  const miss = wynik ? Number(wynik['Miss Kapelusza'] || 0) : 0;
  const suma = judgeMissionPoints(teamId) + miss
             + formatWeightPoints(st.weight) - Number(st.penalties || 0);
  return Math.round(suma * 10) / 10;
}

function toggleJudgeMission(teamId, missionId) {
  const st = judgeStateFor(teamId);
  st.missions[missionId] = !st.missions[missionId];
  renderJudgeCard();
}
function castBeautyVote(teamId, ocena) {
  if (!judgeIsAdmin && String(teamId) === String(judgeOwnTeam)) {
    showMessage('Nie oceniasz własnej drużyny.', 'error');
    return;
  }
  myBeautyVotes[String(teamId)] = ocena;    // od razu na ekranie, zapis w tle
  renderJudgeCard();

  jsonpRequest('saveBeautyVote', { token: judgeToken, teamId: teamId, score: ocena })
    .then(res => {
      if (res && res.status === 'success') {
        showMessage(`Głos oddany: ${ocena}/10`, 'success');
        loadScoresFromSheet();
      } else {
        delete myBeautyVotes[String(teamId)];
        renderJudgeCard();
        showMessage('Nie zapisano głosu: ' + ((res && res.error) || 'błąd'), 'error');
      }
    })
    .catch(() => {
      delete myBeautyVotes[String(teamId)];
      renderJudgeCard();
      showMessage('Brak połączenia — głos NIE został zapisany.', 'error');
    });
}
function setJudgePenalties(teamId, v) { judgeStateFor(teamId).penalties = parseInt(v, 10) || 0; updateJudgeSummary(teamId); }
function setJudgeReturn(teamId, v) { judgeStateFor(teamId).returnTime = v; }
function setJudgeWeight(teamId, v) {
  judgeStateFor(teamId).weight = v;
  const el = document.getElementById('wagaPkt_' + teamId);
  if (el) el.textContent = formatWeightPoints(v);
  updateJudgeSummary(teamId);
}

// Odswieza tylko podsumowanie, zeby nie gubic kursora w polu tekstowym
function updateJudgeSummary(teamId) {
  const box = document.querySelector('.judge-summary');
  if (!box) return;
  const st = judgeStateFor(teamId);
  box.innerHTML = `
    <div>Misje: <b>${judgeMissionPoints(teamId)}</b></div>
    <div>Miss Kapelusza: <b>${missOf(teamId)}</b></div>
    <div>Waga: <b>${formatWeightPoints(st.weight)}</b></div>
    <div>Kary: <b>−${st.penalties || 0}</b></div>
    <div class="judge-total">SUMA: <b>${judgeTotal(teamId)}</b></div>`;
}

// ---------- ZAPIS ----------

function saveJudgeScore(teamId) {
  if (!judgeIsAdmin && String(teamId) === String(judgeOwnTeam)) {
    showMessage('Nie możesz zapisać wyniku własnej drużyny.', 'error');
    return;
  }
  const team = teams.find(t => String(t.id) === String(teamId));
  const st = judgeStateFor(teamId);

  const payload = {
    teamId: teamId,
    teamName: team ? team.name : '',
    missions: Object.keys(st.missions).filter(k => st.missions[k]),
    missionPoints: judgeMissionPoints(teamId),
    weightKg: st.weight,
    penalties: st.penalties,
    returnTime: st.returnTime
  };

  showMessage('Zapisuję wynik...', 'info');

  jsonpRequest('saveScore', {
    token: judgeToken,
    judgeName: judgeName,
    data: JSON.stringify(payload)
  })
    .then(res => {
      if (res && res.status === 'success') {
        showMessage(`Zapisano: ${payload.teamName} — ${res.suma} pkt`, 'success');
        loadScoresFromSheet();
        renderJudgeTeamPicker();
      } else {
        showMessage('Nie udało się zapisać: ' + ((res && res.error) || 'nieznany błąd'), 'error');
      }
    })
    .catch(() => showMessage('Brak połączenia. Wynik NIE został zapisany.', 'error'));
}

// ---------- TABELA WYNIKOW ----------

let savedScores = [];

// Głosy, które ten kapitan już oddał - żeby po odświeżeniu strony nie zgadywał
function loadMyVotes() {
  jsonpRequest('getMyVotes', { token: judgeToken })
    .then(v => { if (v && typeof v === 'object') { myBeautyVotes = v; renderJudgeCard(); } })
    .catch(() => {});
}

function loadScoresFromSheet() {
  jsonpRequest('getScores', {})
    .then(data => { if (Array.isArray(data)) { savedScores = data; renderScoreboard(); } })
    .catch(() => {});
}

function renderScoreboard() {
  const box = document.getElementById('scoreboard');
  if (!box) return;

  if (!savedScores.length) {
    box.innerHTML = '<p class="gallery-empty">Żadna drużyna nie ma jeszcze zapisanego wyniku.</p>';
    return;
  }

  const sorted = savedScores.slice().sort((a, b) => {
    const d = Number(b['SUMA']) - Number(a['SUMA']);
    if (d !== 0) return d;
    const mk = Number(b['Miss Kapelusza']) - Number(a['Miss Kapelusza']);
    if (mk !== 0) return mk;
    return String(a['Godzina powrotu']).localeCompare(String(b['Godzina powrotu']));
  });

  const medale = ['🥇', '🥈', '🥉'];
  box.innerHTML = `
    <table class="scoreboard-table">
      <thead><tr>
        <th>#</th><th>Drużyna</th><th>Misje</th><th>Miss</th><th>Waga</th><th>Kary</th><th>SUMA</th>
      </tr></thead>
      <tbody>
        ${sorted.map((s, i) => `
          <tr class="${i === 0 ? 'winner' : ''}">
            <td>${medale[i] || (i + 1)}</td>
            <td><b>${s['Nazwa drużyny']}</b></td>
            <td>${s['Punkty za misje']}</td>
            <td>${s['Miss Kapelusza']}</td>
            <td>${s['Punkty za wagę']}</td>
            <td>${s['Kary'] ? '−' + s['Kary'] : '—'}</td>
            <td class="score-total">${s['SUMA']}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ================= WYSYLKA ZDJEC PRZEZ DRUZYNY =================

function renderPhotoUploadForm() {
  const misjaSel = document.getElementById('photoMission');
  if (misjaSel) {
    misjaSel.innerHTML = MISSIONS
      .filter(m => PHOTO_MISSIONS.indexOf(m.id) !== -1)
      .map(m => `<option value="${m.id}">${m.title}</option>`).join('');
  }

  const loginBox = document.getElementById('photoLoginBox');
  const uploadBox = document.getElementById('photoUploadBox');
  if (!loginBox || !uploadBox) return;

  if (photoTeamId) {
    loginBox.style.display = 'none';
    uploadBox.style.display = 'block';
    const nazwa = document.getElementById('photoTeamName');
    if (nazwa) nazwa.textContent = '🧺 ' + photoTeamName;
  } else {
    loginBox.style.display = 'block';
    uploadBox.style.display = 'none';
  }

  renderMyPhotos();
}

function loginTeamForPhotos() {
  askPassword('📤 Kod drużyny', 'np. DK7MQ4',
              { hint: 'Sześcioznakowy kod z maila z przydziałem drużyny. Ma go każdy w drużynie.' })
    .then(kod => {
      if (!kod) return;
      showMessage('Sprawdzam kod...', 'info');

      jsonpRequest('teamLogin', { token: kod.trim().toUpperCase() })
        .then(res => {
          if (res && res.authorized) {
            photoTeamCode = kod.trim().toUpperCase();
            photoTeamId = res.teamId;
            photoTeamName = res.teamName;
            renderPhotoUploadForm();
            showMessage(`Drużyna ${res.teamName} — możesz wysyłać zdjęcia`, 'success');
          } else {
            showMessage('Nieprawidłowy kod drużyny!', 'error');
          }
        })
        .catch(() => showMessage('Brak połączenia z arkuszem.', 'error'));
    });
}

function logoutTeamPhotos() {
  photoTeamCode = '';
  photoTeamId = null;
  photoTeamName = '';
  renderPhotoUploadForm();
}

// Zmniejsza zdjecie przed wyslaniem - inaczej 5 MB z telefonu zapcha lacze
function resizeImage(file, maxWidth) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const skala = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * skala);
        canvas.height = Math.round(img.height * skala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Nie można odczytać obrazu'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Nie można odczytać pliku'));
    reader.readAsDataURL(file);
  });
}

function uploadMissionPhoto() {
  const plik = document.getElementById('photoFile').files[0];
  const missionId = document.getElementById('photoMission').value;
  const status = document.getElementById('photoStatus');

  if (!photoTeamCode) { showMessage('Najpierw podaj kod drużyny.', 'error'); return; }
  if (!plik) { showMessage('Najpierw wybierz zdjęcie.', 'error'); return; }

  status.textContent = 'Odczytuję dane zdjęcia...';

  let exifDane = null;

  // NAJPIERW EXIF z oryginalu - skalowanie przez canvas go kasuje
  readExif(plik)
    .then(exif => {
      exifDane = exif;
      status.textContent = 'Przygotowuję zdjęcie...';
      return resizeImage(plik, 1400);
    })
    .then(dataUrl => {
      status.textContent = 'Wysyłam... (przy słabym zasięgu może chwilę potrwać)';

      // POST, bo zdjecie nie zmiesci sie w adresie GET.
      // no-cors: przegladarka nie pokaze odpowiedzi, wiec potwierdzenie
      // bierzemy z ponownego pobrania listy zdjec.
      return fetch(CONFIG.WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'uploadPhoto',
          teamCode: photoTeamCode,     // drużynę ustala serwer z kodu
          missionId: missionId,
          mimeType: 'image/jpeg',
          base64: dataUrl,
          exif: exifDane || {}
        })
      });
    })
    .then(() => {
      status.textContent = '';
      showMessage('Zdjęcie wysłane. Sprawdzam...', 'success');
      document.getElementById('photoFile').value = '';
      setTimeout(loadMissionPhotos, 3000);
    })
    .catch(err => {
      status.textContent = '';
      showMessage('Nie udało się wysłać: ' + err.message, 'error');
    });
}

function loadMissionPhotos() {
  jsonpRequest('getPhotos', {})
    .then(data => {
      if (Array.isArray(data)) {
        missionPhotos = data;
        renderMyPhotos();
        if (isJudgeMode && currentJudgedTeam) renderJudgeCard();
      }
    })
    .catch(() => {});
}

function renderMyPhotos() {
  const box = document.getElementById('myPhotos');
  if (!box) return;
  if (!photoTeamId) { box.innerHTML = ''; return; }
  const moje = missionPhotos.filter(p => String(p.teamId) === String(photoTeamId));

  box.innerHTML = moje.length
    ? `<p class="photo-count">Wysłane zdjęcia tej drużyny: <b>${moje.length}</b></p>
       <div class="gallery-grid">${moje.map(p =>
         `<figure class="gallery-item"><img src="${p.thumb}" alt="">
            <figcaption>${(MISSIONS.find(m => m.id === p.missionId) || {}).title || p.missionId}</figcaption>
          </figure>`).join('')}</div>`
    : '<p class="gallery-empty">Ta drużyna nie wysłała jeszcze żadnego zdjęcia.</p>';
}

window.toggleJudgeMode = toggleJudgeMode;
window.selectJudgedTeam = selectJudgedTeam;
window.toggleJudgeMission = toggleJudgeMission;
window.setJudgeWeight = setJudgeWeight;
window.setJudgePenalties = setJudgePenalties;
window.setJudgeReturn = setJudgeReturn;
window.saveJudgeScore = saveJudgeScore;
window.uploadMissionPhoto = uploadMissionPhoto;
window.loadMissionPhotos = loadMissionPhotos;
window.renderMyPhotos = renderMyPhotos;

window.loadScoresFromSheet = loadScoresFromSheet;

// ================= POGODA ZE STACJI =================
// Dane przychodzą z modelu przez Apps Script. Format opisuje KONTRAKT-POGODA.md.
// Panel jest dodatkiem - jeśli danych nie ma albo są popsute, reszta strony
// ma działać normalnie. Stąd try/catch dookoła wszystkiego.

let weatherData = null;

const WEATHER_ICONS = {
  sunny: '☀️', partly: '⛅', cloudy: '☁️', fog: '🌫️',
  drizzle: '🌦️', rain: '🌧️', storm: '⛈️', snow: '🌨️', wind: '💨'
};

const WIND_DIRS = {
  N: 'płn.', NE: 'płn.-wsch.', E: 'wsch.', SE: 'płd.-wsch.',
  S: 'płd.', SW: 'płd.-zach.', W: 'zach.', NW: 'płn.-zach.'
};

function weatherIcon(kod) {
  return WEATHER_ICONS[kod] || '🌡️';
}

// "2026-09-20T14:30" -> "14 minut temu"
function timeAgo(iso) {
  try {
    const then = new Date(iso);
    if (isNaN(then)) return null;
    const min = Math.floor((Date.now() - then.getTime()) / 60000);
    if (min < 1) return 'przed chwilą';
    if (min < 60) return min + ' min temu';
    const h = Math.floor(min / 60);
    if (h < 24) return h + (h === 1 ? ' godzinę temu' : (h < 5 ? ' godziny temu' : ' godzin temu'));
    const d = Math.floor(h / 24);
    return d + (d === 1 ? ' dzień temu' : ' dni temu');
  } catch (e) { return null; }
}

function isStale(iso, godzin) {
  const then = new Date(iso);
  if (isNaN(then)) return true;
  return (Date.now() - then.getTime()) > godzin * 3600000;
}

function fmt(v, jedn, miejsc) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return n.toFixed(miejsc === undefined ? 1 : miejsc).replace('.', ',') + (jedn || '');
}

// Opady wyswietlamy z kropka jako separatorem dziesietnym.
function fmtRain(v, jedn, miejsc) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return n.toFixed(miejsc === undefined ? 1 : miejsc) + (jedn || '');
}

// Temperatury wyswietlamy z kropka jako separatorem dziesietnym.
function fmtTemp(v, jedn, miejsc) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return n.toFixed(miejsc === undefined ? 1 : miejsc) + (jedn || '');
}

function mushroomMethodText() {
  return 'Jak działa wskaźnik? ' +
    'Ocenia pogodowe warunki do pojawienia się grzybów w skali od 0 do 100. ' +
    'Wilgoć pokazuje, ile wody pozostało w glebie i ściółce po opadach z ostatnich 21 dni. ' +
    'Temperatura określa, czy warunki są odpowiednie do wzrostu. ' +
    'Rozwój uwzględnia czas, który upłynął od deszczu. ' +
    'Im wyższy wynik, tym korzystniejszy układ pogodowy. ' +
    'Wskaźnik nie określa liczby grzybów w lesie.';
}

function mushroomComponentsText(mi) {
  if (!mi) return '';
  const parts = [];
  if (mi.moisture !== undefined) parts.push(`Wilgoć M: ${mi.moisture}/100`);
  if (mi.temperature !== undefined) parts.push(`Temperatura T: ${mi.temperature}/100`);
  if (mi.development !== undefined) parts.push(`Rozwój D: ${mi.development}/100`);
  if (mi.storageMm !== undefined) parts.push(`Magazyn wilgoci: ${fmtRain(mi.storageMm, ' mm')}`);
  return parts.join(' | ');
}

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d)) return dateStr;
  const dni = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
  return dni[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1);
}

// ---------- WSKAZNIK GRZYBOWY ----------
// Liczymy sami tylko wtedy, gdy model go nie przysłał.
// Grzyby potrzebują opadu sprzed 7-14 dni i temperatury 10-18 stopni.

function computeMushroomIndex(history) {
  if (!Array.isArray(history) || history.length < 7) return null;

  const ost = history.slice(-14);
  const okno = ost.slice(0, Math.max(1, ost.length - 4));   // opad sprzed 5-14 dni
  const swieze = ost.slice(-5);                              // ostatnie dni

  const sumaOpadu = okno.reduce((s, d) => s + (Number(d.rainMm) || 0), 0);
  const temps = ost.map(d => Number(d.tempAvgC)).filter(t => !isNaN(t));
  const srT = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  const opadSwiezy = swieze.reduce((s, d) => s + (Number(d.rainMm) || 0), 0);

  // opad: 30 mm w oknie to optimum
  let pkt = Math.min(60, (sumaOpadu / 30) * 60);

  // temperatura: 10-18 stopni idealnie
  if (srT !== null) {
    if (srT >= 10 && srT <= 18) pkt += 25;
    else if (srT >= 6 && srT < 10) pkt += 15;
    else if (srT > 18 && srT <= 22) pkt += 12;
    else pkt += 3;
  }

  // zupelnie sucho tuz przed terminem = grzybnia przysycha
  if (opadSwiezy < 2) pkt -= 12;
  else if (opadSwiezy > 5) pkt += 15;
  else pkt += 8;

  const v = Math.max(0, Math.min(100, Math.round(pkt)));
  let label = 'Kiepsko', reason;
  if (v >= 80) label = 'Wysyp!';
  else if (v >= 65) label = 'Bardzo dobre';
  else if (v >= 45) label = 'Dobre';
  else if (v >= 25) label = 'Średnie';

  reason = `${Math.round(sumaOpadu)} mm deszczu w oknie sprzed 5–14 dni` +
           (srT !== null ? `, średnia temperatura ${srT.toFixed(1).replace('.', ',')} °C` : '') +
           (opadSwiezy < 2 ? '. Ostatnie dni suche — ściółka mogła przeschnąć.' : '.');

  return { value: v, label: label, reason: reason, computed: true };
}

// ---------- POBRANIE ----------

function loadWeather() {
  jsonpRequest('getWeather', {})
    .then(data => {
      if (!data || data.empty) { renderWeather(null); return; }
      weatherData = data;
      renderWeather(data);
    })
    .catch(() => renderWeather(null));
}

// ---------- RENDER: PASEK W NAGLOWKU ----------

function renderWeatherStrip(d) {
  const box = document.getElementById('weatherStrip');
  if (!box) return;

  if (!d || !d.current) { box.style.display = 'none'; return; }

  const c = d.current;
  const mi = d.mushroomIndex || computeMushroomIndex(d.history);

  box.style.display = 'flex';
  box.innerHTML = `
    <div class="ws-item">
      <span class="ws-icon">${weatherIcon(c.icon)}</span>
      <span class="ws-temp">${fmtTemp(c.tempC, ' °C')}</span>
    </div>
    <div class="ws-item ws-sep">
      <span class="ws-lbl">deszcz dziś</span>
      <span class="ws-val">${fmtRain(c.rainTodayMm, ' mm')}</span>
    </div>
    ${mi ? `
    <div class="ws-item ws-sep">
      <span class="ws-lbl">wskaźnik grzybowy</span>
      <span class="ws-val ws-mi ${miClass(mi.value)}">${mi.value}/100 · ${mi.label}</span>
    </div>` : ''}
    <button class="ws-more" onclick="showTab('weather')">szczegóły →</button>`;
}

function miClass(v) {
  if (v >= 65) return 'mi-good';
  if (v >= 45) return 'mi-mid';
  return 'mi-low';
}

// ---------- RENDER: PELNY PANEL ----------

function renderWeather(d) {
  try {
    renderWeatherStrip(d);

    const box = document.getElementById('weatherPanel');
    if (!box) return;

    if (!d) {
      box.innerHTML = `<p class="gallery-empty">
        Dane ze stacji pogodowej pojawią się tutaj wkrótce. 🌦️</p>`;
      return;
    }

    let html = '';

    // ostrzezenie o starych danych
    if (d.updated && isStale(d.updated, 3)) {
      html += `<div class="weather-stale">⚠️ Dane mogą być nieaktualne —
                 ostatni odczyt ${timeAgo(d.updated) || 'dawno temu'}.</div>`;
    }

    // TERAZ
    if (d.current) {
      const c = d.current;

      html += `
        <h3>🌡️ Aktualna pogoda</h3>
        <p class="weather-sub">Odczyt ze stacji na miejscu zbiórki, stan na teraz.</p>
        <div class="weather-now">
          <div class="wn-main">
            <div class="wn-icon">${weatherIcon(c.icon)}</div>

            <div>
              <div class="wn-temp">${fmtTemp(c.tempC, ' °C')}</div>
              <div class="wn-cond">${c.condition || ''}</div>

              ${
                c.feelsLikeC !== undefined
                  ? `<div class="wn-feels">
                       odczuwalna ${fmt(c.feelsLikeC, ' °C')}
                     </div>`
                  : ''
              }
            </div>
          </div>

          <div class="wn-grid">
            ${wnCell(
              '💧',
              'Wilgotność',
              fmt(c.humidity, ' %', 0)
            )}

            ${wnCell(
              '🌧️',
              'Deszcz dziś',
              fmtRain(c.rainTodayMm, ' mm')
            )}

            ${wnCell(
              '💨',
              'Wiatr',
              fmt(c.windKph, ' km/h', 0) +
                (
                  c.windDir
                    ? ' ' + (WIND_DIRS[c.windDir] || c.windDir)
                    : ''
                )
            )}

            ${wnCell(
              '📊',
              'Ciśnienie',
              fmt(c.pressureHpa, ' hPa', 0)
            )}
          </div>
        </div>`;
    }

    // WSKAZNIK GRZYBOWY
    const mi = d.mushroomIndex || computeMushroomIndex(d.history);

    if (mi) {
      const methodText = mushroomMethodText();

      html += `
        <div class="mushroom-index ${miClass(mi.value)}">
          <div class="mi-head">
            <span class="mi-title">
              🍄 Wskaźnik grzybowy
              <button
                type="button"
                class="mi-info"
                title="${methodText}"
                aria-label="Informacja o metodologii wskaźnika grzybowego"
                data-tooltip="${methodText}">i</button>
            </span>

            <span class="mi-value">
              ${mi.value}<small>/100</small>
            </span>
          </div>

          <div class="mi-bar">
            <div class="mi-fill" style="width:${mi.value}%"></div>
          </div>

          <div class="mi-label">${mi.label}</div>

          ${
            mi.moisture !== undefined &&
            mi.temperature !== undefined &&
            mi.development !== undefined
              ? `<div class="mi-components">
                   <div class="mi-component">
                     <span>Wilgoć M</span>
                     <strong>${mi.moisture}/100</strong>
                   </div>
                   <div class="mi-component">
                     <span>Temperatura T</span>
                     <strong>${mi.temperature}/100</strong>
                   </div>
                   <div class="mi-component">
                     <span>Rozwój D</span>
                     <strong>${mi.development}/100</strong>
                   </div>
                   ${mi.storageMm !== undefined
                     ? `<div class="mi-component mi-storage">
                          <span>Magazyn wilgoci</span>
                          <strong>${fmtRain(mi.storageMm, ' mm')}</strong>
                        </div>`
                     : ''}
                 </div>`
              : ''
          }

          ${mi.reason ? `<div class="mi-reason">${mi.reason}</div>` : ''}
          ${mi.computed
            ? `<div class="mi-note">Wyliczone przez stronę z danych stacji.</div>`
            : ''}
        </div>`;
    }

    // HISTORIA OPADOW
    if (Array.isArray(d.history) && d.history.length) {
      const maxRain = Math.max(
        1,
        ...d.history.map(x => Number(x.rainMm) || 0)
      );

      const suma = d.history.reduce(
        (s, x) => s + (Number(x.rainMm) || 0),
        0
      );

      html += `
        <h3>💧 Opady w ostatnich dniach</h3>

        <p class="weather-sub">
          Razem <strong>${fmtRain(suma, ' mm')}</strong>
          w ciągu ${d.history.length} dni.
          To najważniejsza liczba dla grzybiarza.
        </p>

        <div class="rain-chart">
          ${d.history.map(day => {
            const r = Number(day.rainMm) || 0;
            const h = Math.max(2, (r / maxRain) * 100);

            return `
              <div
                class="rain-col"
                title="${day.date}: ${fmtRain(r, ' mm')}">

                <div class="rain-val">
                  ${
                    r > 0
                      ? fmtRain(r, '', r < 10 ? 1 : 0)
                      : ''
                  }
                </div>

                <div
                  class="rain-bar"
                  style="height:${h}%">
                </div>

                <div class="rain-day">
                  ${dayLabel(day.date)}
                </div>
              </div>`;
          }).join('')}
        </div>`;
    }

    // PROGNOZA
    if (Array.isArray(d.forecast) && d.forecast.length) {
      html += `
        <h3>🔮 Prognoza</h3>
        <p class="weather-sub">Wynik autorskiego modelu prognozy pogody, liczonego dla tej lokalizacji.</p>
        <div class="forecast-row">`;

      d.forecast.forEach(f => {
        const dzien = String(f.date) === '2026-10-03';

        // Wskaźnik grzybowy dla konkretnego dnia prognozy.
        // Pole jest opcjonalne, więc starsze dane nadal wyświetlą się poprawnie.
        const mushroomPotential = f.mushroomPotential || null;

        html += `
          <div class="fc-card ${dzien ? 'fc-event' : ''}">

            ${
              dzien
                ? '<div class="fc-badge">GRZYBOBRANIE</div>'
                : ''
            }

            <div class="fc-day">
              ${dayLabel(f.date)}
            </div>

            <div class="fc-icon">
              ${weatherIcon(f.icon)}
            </div>

            <div class="fc-temp">
              ${fmt(f.tempMaxC, '°', 0)}
              <small>
                /${fmt(f.tempMinC, '°', 0)}
              </small>
            </div>

            <div class="fc-rain">
              💧 ${fmtRain(f.rainMm, ' mm')}
              ${
                f.rainChance !== undefined
                  ? ` (${fmt(f.rainChance, '%', 0)})`
                  : ''
              }
            </div>

            <div class="fc-cond">
              ${f.condition || ''}
            </div>

            ${
              mushroomPotential
                ? `
                  <div
                    class="fc-mushroom ${miClass(
                      Number(mushroomPotential.value) || 0
                    )}"
                    title="${mushroomComponentsText(mushroomPotential)}"
                    data-tooltip="${mushroomComponentsText(mushroomPotential)}"
                    tabindex="0"
                    aria-label="${mushroomComponentsText(mushroomPotential)}">

                    <div class="fc-mushroom-value">
                      🍄 ${fmt(
                        mushroomPotential.value,
                        '/100',
                        0
                      )}
                    </div>

                    <div class="fc-mushroom-label">
                      ${mushroomPotential.label || ''}
                    </div>
                  </div>
                `
                : ''
            }
          </div>`;
      });

      html += `</div>`;

      const dzienImprezy = d.forecast.filter(
        f => String(f.date) === '2026-10-03'
      )[0];

      if (dzienImprezy && dzienImprezy.summary) {
        html += `
          <div class="note-box">
            <strong>3 października:</strong>
            ${dzienImprezy.summary}
          </div>`;
      }
    }

    // STOPKA
    html += `
      <div class="weather-foot">
        ${
          d.station && d.station.name
            ? `📍 ${d.station.name}`
            : ''
        }

        ${
          d.updated
            ? ` · odczyt ${timeAgo(d.updated) || d.updated}`
            : ''
        }

        ${
          d.station && d.station.provider
            ? `<br><small>
                 Źródło: ${d.station.provider}
               </small>`
            : ''
        }
      </div>`;

    box.innerHTML = html;

  } catch (err) {
    console.error('Błąd panelu pogodowego:', err);

    const box = document.getElementById('weatherPanel');

    if (box) {
      box.innerHTML = `
        <p class="gallery-empty">
          Nie udało się wczytać danych pogodowych.
        </p>`;
    }
  }
}
function wnCell(ikona, etykieta, wartosc) {
  return `<div class="wn-cell">
            <span class="wn-cell-icon">${ikona}</span>
            <span class="wn-cell-lbl">${etykieta}</span>
            <span class="wn-cell-val">${wartosc}</span>
          </div>`;
}

window.loadWeather = loadWeather;
window.castBeautyVote = castBeautyVote;
window.loadMyVotes = loadMyVotes;

// ================= WYNIKI NA ZYWO (dla wszystkich) =================
// Tablica odswieza sie sama co 20 sekund, gdy zakladka jest otwarta.
// Nie odpytujemy serwera, gdy nikt na nia nie patrzy - po co.

let publicScoresTimer = null;

function startPublicScores() {
  loadPublicScores();
  if (publicScoresTimer) clearInterval(publicScoresTimer);
  publicScoresTimer = setInterval(loadPublicScores, 20000);
}

function stopPublicScores() {
  if (publicScoresTimer) { clearInterval(publicScoresTimer); publicScoresTimer = null; }
}

function loadPublicScores() {
  jsonpRequest('getScores', {})
    .then(data => { if (Array.isArray(data)) { savedScores = data; renderPublicScores(); } })
    .catch(() => {});
}

function renderPublicScores() {
  const box = document.getElementById('publicScoreboard');
  if (!box) return;

  if (!savedScores.length) {
    box.innerHTML = `<div class="results-waiting">
        <div class="rw-icon">⏳</div>
        <p><strong>Wyniki pojawią się tutaj po powrocie z lasu.</strong></p>
        <p class="rw-sub">Komisja ocenia drużynę po drużynie, a tabela aktualizuje się sama.</p>
      </div>`;
    return;
  }

  const sorted = savedScores.slice().sort((a, b) => {
    const d = Number(b['SUMA']) - Number(a['SUMA']);
    if (d !== 0) return d;
    const mk = Number(b['Miss Kapelusza']) - Number(a['Miss Kapelusza']);
    if (mk !== 0) return mk;
    return String(a['Godzina powrotu']).localeCompare(String(b['Godzina powrotu']));
  });

  const ocenionych = sorted.length;
  const wszystkich = teams.length || ocenionych;
  const trwa = ocenionych < wszystkich;

  const medale = ['🥇', '🥈', '🥉'];
  const maxSuma = Math.max(1, ...sorted.map(s => Number(s['SUMA']) || 0));

  box.innerHTML = `
    ${trwa ? `<div class="results-live">
        <span class="live-dot"></span> Ocenianie w toku — ${ocenionych} z ${wszystkich} drużyn.
        Wyniki mogą się jeszcze zmienić.
      </div>` : `<div class="results-final">✅ Ocenianie zakończone — wyniki końcowe.</div>`}

    <div class="podium">
      ${sorted.map((s, i) => `
        <div class="podium-row ${i === 0 && !trwa ? 'winner' : ''}">
          <div class="pr-place">${medale[i] || (i + 1)}</div>
          <div class="pr-body">
            <div class="pr-name">${s['Nazwa drużyny']}</div>
            <div class="pr-bar"><div class="pr-fill" style="width:${(Number(s['SUMA']) / maxSuma) * 100}%"></div></div>
            <div class="pr-detail">
              🎯 ${s['Punkty za misje']} misje ·
              👑 ${s['Miss Kapelusza']} Miss${s['Głosów Miss'] ? ` (${s['Głosów Miss']} gł.)` : ''} ·
              ⚖️ ${s['Punkty za wagę']} waga
              ${Number(s['Kary']) ? ` · ⛔ −${s['Kary']}` : ''}
            </div>
          </div>
          <div class="pr-total">${s['SUMA']}</div>
        </div>`).join('')}
    </div>

    <p class="results-foot">Odświeża się automatycznie co 20 sekund.</p>`;
}

window.startPublicScores = startPublicScores;
window.stopPublicScores = stopPublicScores;

// ================= ODCZYT EXIF ZE ZDJECIA =================
// UWAGA: te dane trzeba wyciagnac z ORYGINALNEGO pliku, zanim
// przeskalujemy zdjecie przez canvas - canvas kasuje caly EXIF.
//
// Czytamy tylko to, co potrzebne: date zrobienia, GPS i model aparatu.
// Wlasny parser zamiast biblioteki, zeby nie ciagnac nic z sieci.

function readExif(file) {
  return new Promise(resolve => {
    const reader = new FileReader();

    reader.onload = function (e) {
      try {
        resolve(parseExifBuffer(e.target.result));
      } catch (err) {
        resolve({ error: 'Nie udało się odczytać danych zdjęcia' });
      }
    };
    reader.onerror = () => resolve({ error: 'Nie udało się otworzyć pliku' });

    // Wystarczy poczatek pliku - EXIF siedzi w pierwszych kilobajtach
    reader.readAsArrayBuffer(file.slice(0, 256 * 1024));
  });
}

function parseExifBuffer(buffer) {
  const view = new DataView(buffer);
  const out = {};

  if (view.getUint16(0, false) !== 0xFFD8) {
    return { error: 'To nie jest plik JPEG' };   // np. PNG albo zrzut ekranu
  }

  let offset = 2;
  const length = view.byteLength;

  // Szukamy segmentu APP1 z podpisem "Exif"
  while (offset < length - 4) {
    if (view.getUint16(offset, false) === 0xFFE1) {
      const exifStart = offset + 4;
      if (view.getUint32(exifStart, false) !== 0x45786966) break;   // "Exif"
      return readTiff(view, exifStart + 6);
    }
    if (view.getUint16(offset, false) === 0xFFDA) break;            // poczatek obrazu
    offset += 2 + view.getUint16(offset + 2, false);
  }

  return { error: 'Zdjęcie nie zawiera danych EXIF' };
}

function readTiff(view, start) {
  const out = {};
  const bom = view.getUint16(start, false);
  const little = (bom === 0x4949);                 // II = little endian
  if (!little && bom !== 0x4D4D) return { error: 'Uszkodzone dane EXIF' };

  const ifd0 = start + view.getUint32(start + 4, little);
  const tagi = czytajIFD(view, ifd0, start, little);

  if (tagi[0x010F]) out.make = String(tagi[0x010F]).trim();
  if (tagi[0x0110]) out.model = String(tagi[0x0110]).trim();
  if (tagi[0x0132]) out.dateFile = String(tagi[0x0132]).trim();

  // Podkatalog EXIF - tam siedzi data zrobienia
  if (tagi[0x8769]) {
    const sub = czytajIFD(view, start + tagi[0x8769], start, little);
    if (sub[0x9003]) out.dateTaken = String(sub[0x9003]).trim();      // DateTimeOriginal
    else if (sub[0x9004]) out.dateTaken = String(sub[0x9004]).trim();
  }

  // Podkatalog GPS
  if (tagi[0x8825]) {
    const gps = czytajIFD(view, start + tagi[0x8825], start, little);
    const lat = dmsNaStopnie(gps[0x0002]);
    const lon = dmsNaStopnie(gps[0x0004]);
    if (lat !== null && lon !== null) {
      out.lat = (gps[0x0001] === 'S' ? -lat : lat);
      out.lon = (gps[0x0003] === 'W' ? -lon : lon);
    }
  }

  if (!out.dateTaken && !out.lat) out.error = 'Zdjęcie nie zawiera daty ani lokalizacji';
  return out;
}

function czytajIFD(view, dirStart, tiffStart, little) {
  const out = {};
  try {
    const ile = view.getUint16(dirStart, little);
    for (let i = 0; i < ile; i++) {
      const wpis = dirStart + 2 + i * 12;
      const tag = view.getUint16(wpis, little);
      out[tag] = czytajWartosc(view, wpis, tiffStart, little);
    }
  } catch (e) { /* uszkodzony katalog - zwracamy co sie da */ }
  return out;
}

function czytajWartosc(view, wpis, tiffStart, little) {
  const typ = view.getUint16(wpis + 2, little);
  const ile = view.getUint32(wpis + 4, little);
  const rozmiary = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const bajtow = (rozmiary[typ] || 1) * ile;

  let dataOffset = wpis + 8;
  if (bajtow > 4) dataOffset = tiffStart + view.getUint32(wpis + 8, little);

  if (typ === 2) {                                   // tekst
    let s = '';
    for (let i = 0; i < ile - 1; i++) {
      const c = view.getUint8(dataOffset + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  if (typ === 3) return view.getUint16(dataOffset, little);
  if (typ === 4) return view.getUint32(dataOffset, little);

  if (typ === 5) {                                   // ulamki - GPS
    const w = [];
    for (let i = 0; i < ile; i++) {
      const licz = view.getUint32(dataOffset + i * 8, little);
      const mian = view.getUint32(dataOffset + i * 8 + 4, little);
      w.push(mian ? licz / mian : 0);
    }
    return ile === 1 ? w[0] : w;
  }

  return null;
}

// GPS w EXIF jest zapisany jako stopnie/minuty/sekundy
function dmsNaStopnie(dms) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  return dms[0] + dms[1] / 60 + dms[2] / 3600;
}

// "2026:10:03 11:42:18" -> obiekt Date
function exifDateNaDate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

// Odleglosc w kilometrach miedzy dwoma punktami (wzor haversine)
function odlegloscKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

// Ocena wiarygodnosci zdjecia. Zwraca etykiety dla komisji.
// WAZNE: to poszlaki, nie dowody. EXIF da sie podrobic,
// a jego brak nie oznacza oszustwa - patrz komentarz nizej.
function ocenZdjecie(exif) {
  const flagi = [];

  if (!exif || exif.error) {
    flagi.push({ typ: 'brak', tekst: exif && exif.error ? exif.error : 'Brak danych EXIF' });
    return flagi;
  }

  // DATA
  const data = exifDateNaDate(exif.dateTaken);
  if (!data) {
    flagi.push({ typ: 'brak', tekst: 'Brak daty zrobienia' });
  } else {
    const dzien = data.toISOString().slice(0, 10);
    const czas = data.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    if (dzien === CONFIG.EVENT_DATE_ISO) {
      flagi.push({ typ: 'ok', tekst: `Zrobione dziś o ${czas}` });
    } else {
      flagi.push({ typ: 'zle', tekst: `Zrobione ${dzien}, nie w dniu zawodów` });
    }
  }

  // MIEJSCE
  if (exif.lat === undefined || exif.lon === undefined) {
    flagi.push({ typ: 'brak', tekst: 'Brak lokalizacji GPS' });
  } else if (CONFIG.EVENT_LAT && CONFIG.EVENT_LON) {
    const km = odlegloscKm(exif.lat, exif.lon, CONFIG.EVENT_LAT, CONFIG.EVENT_LON);
    if (km <= CONFIG.EVENT_RADIUS_KM) {
      flagi.push({ typ: 'ok', tekst: `${km} km od zbiórki` });
    } else {
      flagi.push({ typ: 'zle', tekst: `${km} km od zbiórki — poza terenem` });
    }
  } else {
    flagi.push({ typ: 'info', tekst: `GPS: ${exif.lat.toFixed(4)}, ${exif.lon.toFixed(4)}` });
  }

  if (exif.make || exif.model) {
    flagi.push({ typ: 'info', tekst: [exif.make, exif.model].filter(Boolean).join(' ') });
  }

  return flagi;
}
window.loginTeamForPhotos = loginTeamForPhotos;
window.logoutTeamPhotos = logoutTeamPhotos;
window.updateMissionsTabVisibility = updateMissionsTabVisibility;
window.toggleMissionFoto = toggleMissionFoto;

// ================= GODZINA POWROTU =================
// Organizator ustawia ją w panelu admina, a licznik na stronie głównej
// przełącza się z odliczania do zamknięcia zapisów na odliczanie do powrotu.
// Wartość trzyma Apps Script, więc wszyscy widzą tę samą godzinę.

function loadEventSettings() {
  jsonpRequest('getSettings', {})
    .then(s => {
      if (s && s.returnTime) {
        window.RETURN_TIME = s.returnTime;
      } else {
        window.RETURN_TIME = null;
      }
      if (typeof updateCountdown === 'function') updateCountdown();
      renderReturnTimeStatus();
    })
    .catch(() => {});
}

function renderReturnTimeStatus() {
  const box = document.getElementById('returnTimeStatus');
  if (!box) return;

  if (window.RETURN_TIME) {
    const d = new Date(window.RETURN_TIME);
    box.innerHTML = '<span class="rt-on">Ustawiona: ' +
      d.toLocaleString('pl-PL', { day: 'numeric', month: 'long',
                                  hour: '2-digit', minute: '2-digit' }) +
      '</span>';
    const inp = document.getElementById('returnTimeInput');
    if (inp && !inp.value) {
      // datetime-local wymaga czasu lokalnego bez strefy
      const pad = n => String(n).padStart(2, '0');
      inp.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` +
                  `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  } else {
    box.innerHTML = '<span class="rt-off">Nie ustawiona — licznik odlicza do zamknięcia zapisów.</span>';
  }
}

function saveReturnTime() {
  const inp = document.getElementById('returnTimeInput');
  if (!inp || !inp.value) {
    showMessage('Najpierw wybierz datę i godzinę.', 'error');
    return;
  }
  const d = new Date(inp.value);
  if (isNaN(d.getTime())) { showMessage('Nieprawidłowa data.', 'error'); return; }

  showMessage('Zapisuję godzinę powrotu...', 'info');
  jsonpRequest('setReturnTime', { token: adminToken, value: d.toISOString() })
    .then(res => {
      if (res && res.status === 'success') {
        window.RETURN_TIME = res.returnTime;
        if (typeof updateCountdown === 'function') updateCountdown();
        renderReturnTimeStatus();
        showMessage('Licznik przełączony na odliczanie do powrotu.', 'success');
      } else {
        showMessage('Nie udało się zapisać: ' + ((res && res.error) || 'błąd'), 'error');
      }
    })
    .catch(() => showMessage('Brak połączenia z arkuszem.', 'error'));
}

function clearReturnTime() {
  showMessage('Czyszczę godzinę powrotu...', 'info');
  jsonpRequest('setReturnTime', { token: adminToken, value: '' })
    .then(res => {
      if (res && res.status === 'success') {
        window.RETURN_TIME = null;
        const inp = document.getElementById('returnTimeInput');
        if (inp) inp.value = '';
        if (typeof updateCountdown === 'function') updateCountdown();
        renderReturnTimeStatus();
        showMessage('Licznik wrócił do odliczania zapisów.', 'success');
      } else {
        showMessage('Nie udało się wyczyścić.', 'error');
      }
    })
    .catch(() => showMessage('Brak połączenia z arkuszem.', 'error'));
}

window.saveReturnTime = saveReturnTime;
window.clearReturnTime = clearReturnTime;
window.loadEventSettings = loadEventSettings;
