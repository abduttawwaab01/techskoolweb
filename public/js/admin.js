const tableState = { name: '', offset: 0, limit: 25, total: 0 };

const noticeEl = document.getElementById('adminNotice');
const tableSelect = document.getElementById('tableSelect');
const tableHead = document.getElementById('tableHead');
const tableBody = document.getElementById('tableBody');

function handleError(error) {
  showNotice(noticeEl, error.message);
}

function cell(row, value, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  if (value === null || value === undefined || value === '') {
    td.textContent = '—';
  } else if (typeof value === 'object') {
    td.textContent = JSON.stringify(value);
  } else {
    td.textContent = String(value);
  }
  row.appendChild(td);
  return td;
}

function actionButton(label, className, dataset) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-sm ${className}`;
  button.textContent = label;
  Object.assign(button.dataset, dataset);
  return button;
}

function renderStats(stats) {
  const items = [
    ['Users', stats.users],
    ['Messages today', stats.messages_today],
    ['Direct messages', stats.direct_messages],
    ['Active sessions', stats.active_sessions],
  ];
  const fragment = document.createDocumentFragment();
  for (const [label, value] of items) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    const labelEl = document.createElement('span');
    labelEl.className = 'stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'stat-value';
    valueEl.textContent = value;
    card.append(labelEl, valueEl);
    fragment.appendChild(card);
  }
  document.getElementById('statsGrid').replaceChildren(fragment);
}

function renderUsers(users) {
  const body = document.getElementById('usersBody');
  const fragment = document.createDocumentFragment();

  if (!users.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.className = 'empty-row';
    td.textContent = 'No users found.';
    tr.appendChild(td);
    fragment.appendChild(tr);
  }

  for (const user of users) {
    const tr = document.createElement('tr');
    cell(tr, user.display_name);
    cell(tr, user.email);

    const roleCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${user.role === 'admin' ? 'badge-admin' : 'badge-user'}`;
    badge.textContent = user.role;
    roleCell.appendChild(badge);
    tr.appendChild(roleCell);

    const statusCell = document.createElement('td');
    const status = document.createElement('span');
    status.className = `badge ${user.is_active ? 'badge-user' : 'badge-off'}`;
    status.textContent = user.is_active ? 'active' : 'disabled';
    statusCell.appendChild(status);
    tr.appendChild(statusCell);

    cell(tr, user.message_count);
    cell(tr, formatDate(user.created_at));

    const actions = document.createElement('td');
    actions.className = 'cell-actions';
    if (user.role === 'admin') {
      actions.textContent = '—';
    } else {
      actions.appendChild(
        actionButton(user.is_active ? 'Disable' : 'Enable', user.is_active ? 'btn-danger' : 'btn-emerald', {
          userId: user.id,
          active: String(user.is_active),
        })
      );
    }
    tr.appendChild(actions);
    fragment.appendChild(tr);
  }

  body.replaceChildren(fragment);
}

function renderMessages(messages) {
  const body = document.getElementById('messagesBody');
  const fragment = document.createDocumentFragment();

  if (!messages.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'empty-row';
    td.textContent = 'No messages yet.';
    tr.appendChild(td);
    fragment.appendChild(tr);
  }

  for (const message of messages) {
    const tr = document.createElement('tr');
    cell(tr, message.id);
    cell(tr, `${message.author} (${message.author_email})`);
    cell(tr, message.channel);
    cell(tr, message.body, 'truncate');
    cell(tr, formatDate(message.created_at));

    const actions = document.createElement('td');
    actions.className = 'cell-actions';
    if (message.deleted_at) {
      actions.textContent = 'Deleted';
    } else {
      actions.appendChild(actionButton('Delete', 'btn-danger', { messageId: String(message.id) }));
    }
    tr.appendChild(actions);
    fragment.appendChild(tr);
  }

  body.replaceChildren(fragment);
}

function renderAudit(entries) {
  const body = document.getElementById('auditBody');
  const fragment = document.createDocumentFragment();

  if (!entries.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'empty-row';
    td.textContent = 'No admin actions recorded yet.';
    tr.appendChild(td);
    fragment.appendChild(tr);
  }

  for (const entry of entries) {
    const tr = document.createElement('tr');
    cell(tr, formatDate(entry.created_at));
    cell(tr, entry.admin);
    cell(tr, entry.action);
    cell(tr, entry.target);
    cell(tr, entry.details ? JSON.stringify(entry.details) : null);
    fragment.appendChild(tr);
  }

  body.replaceChildren(fragment);
}

function renderTableList(tables) {
  tableSelect.replaceChildren();
  for (const table of tables) {
    const option = document.createElement('option');
    option.value = table.name;
    option.textContent = `${table.name} (${table.rowCount} rows)`;
    tableSelect.appendChild(option);
  }
  if (tables.length) {
    tableState.name = tables[0].name;
    tableSelect.value = tables[0].name;
    loadTableRows();
  }
}

async function loadTableRows() {
  if (!tableState.name) return;
  const params = new URLSearchParams({
    limit: String(tableState.limit),
    offset: String(tableState.offset),
  });

  const data = await api(`/api/admin/tables/${encodeURIComponent(tableState.name)}/rows?${params}`);
  tableState.total = data.total;

  const headFragment = document.createDocumentFragment();
  const headRow = document.createElement('tr');
  for (const column of data.columns) {
    const th = document.createElement('th');
    th.textContent = column;
    headRow.appendChild(th);
  }
  headFragment.appendChild(headRow);
  tableHead.replaceChildren(headFragment);

  const fragment = document.createDocumentFragment();
  if (!data.rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = Math.max(data.columns.length, 1);
    td.className = 'empty-row';
    td.textContent = 'No rows in this table.';
    tr.appendChild(td);
    fragment.appendChild(tr);
  }

  for (const row of data.rows) {
    const tr = document.createElement('tr');
    for (const column of data.columns) {
      cell(tr, row[column], 'truncate');
    }
    fragment.appendChild(tr);
  }
  tableBody.replaceChildren(fragment);

  const start = data.total ? data.offset + 1 : 0;
  const end = Math.min(data.offset + data.limit, data.total);
  document.getElementById('pageInfo').textContent = `${start}–${end} of ${data.total}`;
  document.getElementById('tableCount').textContent = `${data.columns.length} columns`;
  document.getElementById('prevPage').disabled = data.offset === 0;
  document.getElementById('nextPage').disabled = data.offset + data.limit >= data.total;
}

async function loadAll() {
  const [stats, users, messages, audit, tables] = await Promise.all([
    api('/api/admin/stats'),
    api('/api/admin/users'),
    api('/api/admin/messages'),
    api('/api/admin/audit'),
    api('/api/admin/tables'),
  ]);
  renderStats(stats.stats);
  renderUsers(users.users);
  renderMessages(messages.messages);
  renderAudit(audit.entries);
  renderTableList(tables.tables);
}

function bindEvents() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    showNotice(noticeEl, '');
    loadAll().catch(handleError);
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  });

  tableSelect.addEventListener('change', () => {
    tableState.name = tableSelect.value;
    tableState.offset = 0;
    loadTableRows().catch(handleError);
  });

  document.getElementById('prevPage').addEventListener('click', () => {
    tableState.offset = Math.max(0, tableState.offset - tableState.limit);
    loadTableRows().catch(handleError);
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    if (tableState.offset + tableState.limit < tableState.total) {
      tableState.offset += tableState.limit;
      loadTableRows().catch(handleError);
    }
  });

  document.getElementById('usersBody').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-user-id]');
    if (!button) return;
    try {
      showNotice(noticeEl, '');
      await api(`/api/admin/users/${button.dataset.userId}`, {
        method: 'PATCH',
        body: { isActive: button.dataset.active !== 'true' },
      });
      await loadAll();
    } catch (error) {
      handleError(error);
    }
  });

  document.getElementById('messagesBody').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-message-id]');
    if (!button) return;
    try {
      showNotice(noticeEl, '');
      await api(`/api/admin/messages/${button.dataset.messageId}`, { method: 'DELETE' });
      await Promise.all([
        api('/api/admin/stats').then((data) => renderStats(data.stats)),
        api('/api/admin/messages').then((data) => renderMessages(data.messages)),
        api('/api/admin/audit').then((data) => renderAudit(data.entries)),
        loadTableRows(),
      ]);
    } catch (error) {
      handleError(error);
    }
  });
}

async function init() {
  try {
    const { user } = await api('/api/auth/me');
    if (!user) {
      window.location.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      window.location.replace('/');
      return;
    }
    bindEvents();
    await loadAll();
  } catch (error) {
    handleError(error);
  }
}

init();
