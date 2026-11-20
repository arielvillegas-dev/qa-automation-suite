let token = localStorage.getItem('qa_token') || '';
let currentUser = null;

const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const userBadge = document.getElementById('user-badge');
const userLabel = document.getElementById('user-label');
const webhooksCard = document.getElementById('webhooks-card');

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function showAlert(el, message, isError) {
  el.textContent = message;
  el.className = `alert ${isError ? 'error' : 'success'}`;
  el.classList.remove('hidden');
}

function renderOrders(orders) {
  const tbody = document.getElementById('orders-tbody');
  tbody.textContent = '';
  for (const order of orders) {
    const tr = document.createElement('tr');
    tr.dataset.orderId = String(order.id);

    const tdRef = document.createElement('td');
    tdRef.textContent = order.reference;

    const tdEmail = document.createElement('td');
    tdEmail.textContent = order.customer_email;

    const tdAmt = document.createElement('td');
    tdAmt.textContent = `${(order.amount_cents / 100).toFixed(2)} ${order.currency}`;

    const tdStatus = document.createElement('td');
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Status for ${order.reference}`);
    for (const st of ['pending', 'processing', 'completed', 'cancelled']) {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if (st === order.status) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', async () => {
      await api(`/api/orders/${order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: select.value }),
      });
      await loadOrders();
    });
    tdStatus.appendChild(select);

    const tdActions = document.createElement('td');
    if (currentUser?.role === 'admin') {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-danger';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        await api(`/api/orders/${order.id}`, { method: 'DELETE' });
        await loadOrders();
      });
      tdActions.appendChild(del);
    } else {
      tdActions.textContent = 'Read/Update';
    }

    tr.append(tdRef, tdEmail, tdAmt, tdStatus, tdActions);
    tbody.appendChild(tr);
  }
}

async function loadOrders() {
  const q = encodeURIComponent(document.getElementById('search-input').value.trim());
  const st = encodeURIComponent(document.getElementById('status-filter').value);
  const res = await api(`/api/orders?q=${q}&status=${st}`);
  if (res.ok) renderOrders(res.data.data || []);
}

async function loadWebhooks() {
  if (currentUser?.role !== 'admin') return;
  const res = await api('/api/webhooks');
  if (!res.ok) return;
  const ul = document.getElementById('webhook-list');
  ul.textContent = '';
  for (const wh of res.data.data || []) {
    const li = document.createElement('li');
    li.textContent = `${wh.event} -> ${wh.url}`;
    ul.appendChild(li);
  }
}

async function enterSession() {
  const me = await api('/api/auth/me');
  if (!me.ok) {
    token = '';
    localStorage.removeItem('qa_token');
    loginView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
    userBadge.classList.add('hidden');
    return;
  }
  currentUser = me.data.user;
  userLabel.textContent = `${currentUser.name} (${currentUser.role})`;
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  userBadge.classList.remove('hidden');
  if (currentUser.role === 'admin') {
    webhooksCard.classList.remove('hidden');
    await loadWebhooks();
  } else {
    webhooksCard.classList.add('hidden');
  }
  await loadOrders();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const res = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    showAlert(errEl, res.data.error || 'Login failed', true);
    return;
  }
  token = res.data.token;
  localStorage.setItem('qa_token', token);
  await enterSession();
});

document.getElementById('logout-btn').addEventListener('click', () => {
  token = '';
  currentUser = null;
  localStorage.removeItem('qa_token');
  enterSession();
});

document.getElementById('order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fb = document.getElementById('order-feedback');
  const payload = {
    reference: document.getElementById('order-ref').value,
    customerEmail: document.getElementById('order-email').value,
    amount: Number(document.getElementById('order-amount').value),
    currency: document.getElementById('order-currency').value,
  };
  const res = await api('/api/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': `ui-${payload.reference}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = res.data.details ? Object.values(res.data.details).join(' ') : (res.data.error || 'Error');
    showAlert(fb, msg, true);
    return;
  }
  showAlert(fb, `Order ${res.data.data.reference} created.`, false);
  e.target.reset();
  await loadOrders();
});

document.getElementById('webhook-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fb = document.getElementById('webhook-feedback');
  const url = document.getElementById('webhook-url').value;
  const res = await api('/api/webhooks', {
    method: 'POST',
    body: JSON.stringify({ url, event: 'order.created' }),
  });
  if (!res.ok) {
    showAlert(fb, res.data.error || 'Failed to register webhook', true);
    return;
  }
  showAlert(fb, 'Webhook registered safely.', false);
  e.target.reset();
  await loadWebhooks();
});

document.getElementById('search-input').addEventListener('input', loadOrders);
document.getElementById('status-filter').addEventListener('change', loadOrders);

if (token) enterSession();
