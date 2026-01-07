const STORAGE_TYPES = {
  LOCAL: 'local',
  SESSION: 'session',
  COOKIES: 'cookies'
};

const RESTRICTED_PREFIXES = ['chrome://', 'about:', 'edge://'];

const DOM_IDS = {
  TABLE_BODY: '#storageTable tbody',
  BTN_LOCAL: 'btn-local',
  BTN_SESSION: 'btn-session',
  BTN_COOKIES: 'btn-cookies',

  ADD_FORM: 'add-form',
  INPUT_KEY: 'add-key',
  INPUT_VALUE: 'add-value'
};

let currentStorageType = STORAGE_TYPES.LOCAL;

function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some(prefix => url.startsWith(prefix));
}

async function getData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (isRestrictedUrl(tab.url)) {
    return { local: {}, session: {}, cookies: [] };
  }
  
  // Get Local & Session Storage via Script Injection
  const storage = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      local: { ...localStorage },
      session: { ...sessionStorage }
    })
  });

  const cookies = await chrome.cookies.getAll({ url: tab.url });

  return { ...storage[0].result, cookies };
}

async function handleUpdate(type, oldKey, newKey, newValue) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || isRestrictedUrl(tab.url)) return;

  if (oldKey && oldKey !== newKey) {
    if (type === STORAGE_TYPES.COOKIES) {
      await chrome.cookies.remove({ url: tab.url, name: oldKey });
    } else {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (storageType, storageKey) => {
          if (storageType === 'local') {
            localStorage.removeItem(storageKey);
          } else {
            sessionStorage.removeItem(storageKey);
          }
        },
        args: [type, oldKey]
      });
    }
  }

  if (type === STORAGE_TYPES.COOKIES) {
    await chrome.cookies.set({ url: tab.url, name: newKey, value: newValue });
  } else {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (storageType, storageKey, storageValue) => {
        if (storageType === 'local') {
          localStorage.setItem(storageKey, storageValue);
        } else {
          sessionStorage.setItem(storageKey, storageValue);
        }
      },
      args: [type, newKey, newValue]
    });
  }
  renderTable(type);
}

async function handleRemove(type, key) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || isRestrictedUrl(tab.url)) return;

  if (type === STORAGE_TYPES.COOKIES) {
    await chrome.cookies.remove({ url: tab.url, name: key });
  } else {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (storageType, storageKey) => {
        if (storageType === 'local') {
          localStorage.removeItem(storageKey);
        } else {
          sessionStorage.removeItem(storageKey);
        }
      },
      args: [type, key]
    });
  }
  renderTable(type); // Refresh UI
}



async function handleAddItem(e) {
  if (e) e.preventDefault();
  const keyInput = document.getElementById(DOM_IDS.INPUT_KEY);
  const valueInput = document.getElementById(DOM_IDS.INPUT_VALUE);
  const key = keyInput.value.trim();
  const value = valueInput.value.trim();

  if (!key) return; // Basic validation

  // Use handleUpdate to set the item (pass null for oldKey)
  await handleUpdate(currentStorageType, null, key, value);

  // Clear inputs
  keyInput.value = '';
  valueInput.value = '';

  // Refresh Table
  renderTable(currentStorageType);
}

async function renderTable(type) {
  currentStorageType = type;
  
  // Update Tab Styling
  [DOM_IDS.BTN_LOCAL, DOM_IDS.BTN_SESSION, DOM_IDS.BTN_COOKIES].forEach(id => {
    const btn = document.getElementById(id);
    if (type === STORAGE_TYPES.LOCAL && id === DOM_IDS.BTN_LOCAL) btn.classList.add('active');
    else if (type === STORAGE_TYPES.SESSION && id === DOM_IDS.BTN_SESSION) btn.classList.add('active');
    else if (type === STORAGE_TYPES.COOKIES && id === DOM_IDS.BTN_COOKIES) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  const data = await getData();
  const tbody = document.querySelector(DOM_IDS.TABLE_BODY);
  tbody.innerHTML = '';

  const items = type === STORAGE_TYPES.COOKIES 
    ? data.cookies.map(c => ({ key: c.name, value: c.value }))
    : Object.entries(data[type] || {}).map(([key, value]) => ({ key, value }));

  items.forEach(item => {
    const tr = document.createElement('tr');
    
    // Key Column
    const tdKey = document.createElement('td');
    const inputKey = document.createElement('input');
    inputKey.type = 'text';
    inputKey.value = item.key;
    inputKey.addEventListener('change', (e) => handleUpdate(type, item.key, e.target.value, item.value));
    tdKey.appendChild(inputKey);
    tr.appendChild(tdKey);
    
    // Value Column
    const tdValue = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = item.value;
    input.addEventListener('change', (e) => handleUpdate(type, item.key, item.key, e.target.value));
    tdValue.appendChild(input);
    tr.appendChild(tdValue);
    
    // Actions Column
    const tdActions = document.createElement('td');
    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Delete';
    btnDelete.addEventListener('click', () => handleRemove(type, item.key));
    tdActions.appendChild(btnDelete);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById(DOM_IDS.BTN_LOCAL).addEventListener('click', () => renderTable(STORAGE_TYPES.LOCAL));
  document.getElementById(DOM_IDS.BTN_SESSION).addEventListener('click', () => renderTable(STORAGE_TYPES.SESSION));
  document.getElementById(DOM_IDS.BTN_COOKIES).addEventListener('click', () => renderTable(STORAGE_TYPES.COOKIES));
  document.getElementById(DOM_IDS.ADD_FORM).addEventListener('submit', handleAddItem);

  // Initial Load
  renderTable(STORAGE_TYPES.LOCAL);
});