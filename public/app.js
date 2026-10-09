let allClients = [];

document.addEventListener('DOMContentLoaded', () => {
  loadClients();
  loadQRCode();
  registerServiceWorker();

  const form = document.getElementById('add-client-form');
  if (form) {
    form.addEventListener('submit', handleAddClient);
  }
});

async function handleAddClient(e) {
  e.preventDefault();
  const nameInput = document.getElementById('client-name');
  const dateInput = document.getElementById('expiry-date');

  const name = nameInput.value.trim();
  const expiryDate = dateInput.value;

  if (!name || !expiryDate) {
    alert('يرجى إدخال اسم العميل وتاريخ الانتهاء كاملاً');
    return;
  }

  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, expiryDate })
    });

    if (res.ok) {
      nameInput.value = '';
      dateInput.value = '';
      alert('تم حفظ العميل بنجاح! 🎉');
      await loadClients();
    } else {
      throw new Error();
    }
  } catch (err) {
    saveToLocalStorage({ id: Date.now().toString(), name, expiryDate });
    nameInput.value = '';
    dateInput.value = '';
    alert('تم حفظ العميل محلياً بنجاح! 🎉');
    loadClients();
  }
}

async function loadClients() {
  try {
    const res = await fetch('/api/clients');
    if (res.ok) {
      allClients = await res.json();
    } else {
      throw new Error();
    }
  } catch (err) {
    allClients = getFromLocalStorage();
  }
  renderClients(allClients);
  updateStats(allClients);
}

function saveToLocalStorage(client) {
  const local = getFromLocalStorage();
  local.push(client);
  localStorage.setItem('wisal_clients', JSON.stringify(local));
}

function getFromLocalStorage() {
  try {
    return JSON.parse(localStorage.getItem('wisal_clients')) || [];
  } catch {
    return [];
  }
}

function deleteFromLocalStorage(id) {
  let local = getFromLocalStorage();
  local = local.filter(c => c.id !== id);
  localStorage.setItem('wisal_clients', JSON.stringify(local));
}

async function deleteClient(id) {
  if (!confirm('هل أنتِ متأكدة من حذف هذا العميل؟')) return;

  try {
    await fetch(`/api/clients/${id}`, { method: 'DELETE' });
  } catch (err) {}
  
  deleteFromLocalStorage(id);
  alert('تم حذف العميل بنجاح');
  loadClients();
}

async function loadQRCode() {
  const img = document.getElementById('modal-qr-img');
  if (!img) return;

  try {
    const res = await fetch('/api/qr-code');
    const data = await res.json();
    if (data.qrCode) {
      img.src = data.qrCode;
      return;
    }
  } catch (err) {}

  const currentUrl = window.location.href;
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentUrl)}`;
}

function openQrModal() {
  const modal = document.getElementById('qr-modal');
  if (modal) {
    modal.classList.add('active');
    loadQRCode();
  }
}

function closeQrModal() {
  const modal = document.getElementById('qr-modal');
  if (modal) modal.classList.remove('active');
}

function renderClients(clients) {
  const tbody = document.getElementById('clients-list');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!clients || clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:30px;">لا يوجد عملاء مضافون حالياً. أضيفي أول عميل من النموذج أعلاه.</td></tr>`;
    return;
  }

  const today = new Date();
  today.setHours(0,0,0,0);

  clients.forEach(c => {
    const exp = new Date(c.expiryDate);
    exp.setHours(0,0,0,0);
    
    const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    
    let badgeHtml = `<span class="badge badge-success">سارية</span>`;
    let daysText = `${diffDays} يوم`;

    if (diffDays < 0) {
      badgeHtml = `<span class="badge badge-danger">منتهية</span>`;
      daysText = `منتهية منذ ${Math.abs(diffDays)} يوم`;
    } else if (diffDays <= 5) {
      badgeHtml = `<span class="badge badge-warning">تنتهي قريباً</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:700;">${c.name}</td>
      <td>${c.expiryDate}</td>
      <td>${daysText}</td>
      <td>${badgeHtml}</td>
      <td>
        <button class="btn btn-danger-sm" onclick="deleteClient('${c.id}')">
          <i class="fa-solid fa-trash"></i> حذف
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateStats(clients) {
  const today = new Date();
  today.setHours(0,0,0,0);

  let warningCount = 0;
  let expiredCount = 0;

  clients.forEach(c => {
    const exp = new Date(c.expiryDate);
    exp.setHours(0,0,0,0);
    const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) expiredCount++;
    else if (diffDays <= 5) warningCount++;
  });

  const totalEl = document.getElementById('stat-total');
  const warnEl = document.getElementById('stat-warning');
  const expEl = document.getElementById('stat-expired');

  if (totalEl) totalEl.innerText = clients.length;
  if (warnEl) warnEl.innerText = warningCount;
  if (expEl) expEl.innerText = expiredCount;
}

function filterClients() {
  const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  const filtered = allClients.filter(c => c.name.toLowerCase().includes(q));
  renderClients(filtered);
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {}
  }
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    alert('متصفحك لا يدعم الإشعارات');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('تم رفض إذن الإشعارات');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const keyRes = await fetch('/api/vapid-key');
    const { publicKey } = await keyRes.json();

    if (!publicKey) {
      alert('تم تفعيل إذن الإشعارات محلياً!');
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    alert('تم ربط هذا الجهاز بنجاح! 🎉');
  } catch (e) {
    alert('تم قبول إذن التنبيهات!');
  }
}

async function sendTestNotification() {
  try {
    const res = await fetch('/api/test-notification', { method: 'POST' });
    if (res.ok) alert('تم إرسال طلب الإشعار التجريبي!');
  } catch (e) {
    alert('يتطلب الإشعار ربط سيرفر أونلاين بـ HTTPS.');
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}