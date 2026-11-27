const state = {
  me: null,
  view: { type: 'global' },
  lastGlobalId: 0,
  lastDmId: 0,
  seen: new Set(),
  users: [],
  conversations: [],
};

const messagesEl = document.getElementById('messages');
const noticeEl = document.getElementById('chatNotice');
const dmListEl = document.getElementById('dmList');
const userListEl = document.getElementById('userList');
const generalRoomEl = document.getElementById('generalRoom');
const chatTitleEl = document.getElementById('chatTitle');
const chatSubtitleEl = document.getElementById('chatSubtitle');
const channelBadgeEl = document.getElementById('channelBadge');
const inputEl = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

function handleError(error) {
  showNotice(noticeEl, error.message);
}

function renderMe(user) {
  document.getElementById('currentUser').textContent = user.displayName;
  document.getElementById('userAvatar').textContent = initials(user.displayName);
  const badge = document.getElementById('roleBadge');
  badge.className = `badge ${user.role === 'admin' ? 'badge-admin' : 'badge-user'}`;
  badge.textContent = user.role;
  document.getElementById('adminLink').hidden = user.role !== 'admin';
}

function sidebarButton({ title, subtitle, avatarText, active, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sidebar-item' + (active ? ' active' : '');

  if (avatarText) {
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = avatarText;
    button.appendChild(avatar);
  }

  const main = document.createElement('span');
  main.className = 'item-main';
  const titleEl = document.createElement('span');
  titleEl.className = 'item-title';
  titleEl.textContent = title;
  const subEl = document.createElement('span');
  subEl.className = 'item-sub';
  subEl.textContent = subtitle || '';
  main.append(titleEl, subEl);
  button.appendChild(main);
  button.addEventListener('click', onClick);
  return button;
}

function emptyList(element, text) {
  const paragraph = document.createElement('p');
  paragraph.className = 'sidebar-empty';
  paragraph.textContent = text;
  element.appendChild(paragraph);
}

function renderSidebar() {
  dmListEl.replaceChildren();
  userListEl.replaceChildren();

  if (!state.conversations.length) {
    emptyList(dmListEl, 'No conversations yet.');
  } else {
    for (const conversation of state.conversations) {
      const active = state.view.type === 'dm' && state.view.id === conversation.id;
      dmListEl.appendChild(
        sidebarButton({
          title: conversation.otherName,
          subtitle: conversation.lastBody || 'Start a conversation',
          avatarText: initials(conversation.otherName),
          active,
          onClick: () =>
            setView({
              type: 'dm',
              id: conversation.id,
              userId: conversation.otherId,
              name: conversation.otherName,
            }),
        })
      );
    }
  }

  if (!state.users.length) {
    emptyList(userListEl, 'No other members yet.');
  } else {
    for (const user of state.users) {
      userListEl.appendChild(
        sidebarButton({
          title: user.displayName,
          subtitle: user.role === 'admin' ? 'Admin' : 'Member',
          avatarText: initials(user.displayName),
          onClick: () => openDm(user),
        })
      );
    }
  }

  generalRoomEl.classList.toggle('active', state.view.type === 'global');
}

async function refreshSidebar() {
  const [usersResult, conversationsResult] = await Promise.all([
    api('/api/users'),
    api('/api/conversations'),
  ]);
  state.users = usersResult.users || [];
  state.conversations = conversationsResult.conversations || [];
  renderSidebar();
}

async function openDm(user) {
  try {
    showNotice(noticeEl, '');
    const { conversation } = await api('/api/conversations', {
      method: 'POST',
      body: { userId: user.id },
    });
    setView({ type: 'dm', id: conversation.id, userId: user.id, name: user.displayName });
    await refreshSidebar();
  } catch (error) {
    handleError(error);
  }
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
}

function setView(view) {
  closeSidebar();
  state.view = view;
  state.seen = new Set();
  state.lastGlobalId = 0;
  state.lastDmId = 0;
  messagesEl.replaceChildren();
  const placeholder = document.createElement('div');
  placeholder.className = 'messages-empty';
  const strong = document.createElement('strong');
  strong.textContent = 'Loading messages…';
  placeholder.appendChild(strong);
  messagesEl.appendChild(placeholder);

  if (view.type === 'global') {
    chatTitleEl.textContent = '# general';
    chatSubtitleEl.textContent = 'A place for the whole team';
    channelBadgeEl.textContent = 'Public room';
    channelBadgeEl.className = 'badge badge-user';
  } else {
    chatTitleEl.textContent = view.name;
    chatSubtitleEl.textContent = 'Private conversation';
    channelBadgeEl.textContent = 'Direct message';
    channelBadgeEl.className = 'badge badge-admin';
  }

  renderSidebar();
  loadMessages().catch(handleError);
}

function clearEmptyState() {
  messagesEl.querySelectorAll('.messages-empty').forEach((element) => element.remove());
}

function messageElement(message) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${message.mine ? 'mine' : 'theirs'}`;

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  const author = document.createElement('strong');
  author.textContent = message.mine ? 'You' : message.author.displayName;
  const time = document.createElement('span');
  time.textContent = formatDate(message.createdAt);
  meta.append(author, time);

  const body = document.createElement('div');
  body.className = 'message-body';
  body.textContent = message.body;

  wrapper.append(meta, body);
  return wrapper;
}

async function loadMessages() {
  const view = state.view;
  let data;

  if (view.type === 'global') {
    data = await api(`/api/messages?after=${state.lastGlobalId}&limit=50`);
  } else {
    data = await api(
      `/api/conversations/${encodeURIComponent(view.id)}/messages?after=${state.lastDmId}&limit=50`
    );
  }

  const list = data.messages || [];
  if (list.length) clearEmptyState();
  const nearBottom =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 140;
  let added = 0;

  for (const message of list) {
    if (state.seen.has(message.id)) continue;
    state.seen.add(message.id);
    messagesEl.appendChild(messageElement(message));
    added += 1;

    const id = Number(message.id);
    if (view.type === 'global') state.lastGlobalId = Math.max(state.lastGlobalId, id);
    else state.lastDmId = Math.max(state.lastDmId, id);
  }

  if (!messagesEl.querySelector('.message')) {
    messagesEl.replaceChildren();
    const placeholder = document.createElement('div');
    placeholder.className = 'messages-empty';
    const strong = document.createElement('strong');
    strong.textContent = 'No messages yet';
    const small = document.createElement('span');
    small.textContent = 'Say hello to get the conversation started.';
    placeholder.append(strong, small);
    messagesEl.appendChild(placeholder);
  }

  if (added && nearBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const body = inputEl.value.trim();
  if (!body) return;

  const viewAtSend = { ...state.view };
  sendBtn.disabled = true;

  try {
    showNotice(noticeEl, '');
    let message;
    if (viewAtSend.type === 'global') {
      ({ message } = await api('/api/messages', { method: 'POST', body: { body } }));
    } else {
      ({ message } = await api(`/api/conversations/${encodeURIComponent(viewAtSend.id)}/messages`, {
        method: 'POST',
        body: { body },
      }));
    }

    if (state.view.type === viewAtSend.type && state.view.id === viewAtSend.id) {
      clearEmptyState();
      state.seen.add(message.id);
      messagesEl.appendChild(messageElement(message));
      const id = Number(message.id);
      if (viewAtSend.type === 'global') state.lastGlobalId = Math.max(state.lastGlobalId, id);
      else state.lastDmId = Math.max(state.lastDmId, id);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    inputEl.value = '';
    inputEl.style.height = 'auto';
    inputEl.focus();
    refreshSidebar().catch(handleError);
  } catch (error) {
    handleError(error);
  } finally {
    sendBtn.disabled = false;
  }
}

function bindEvents() {
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('open');
  });
  generalRoomEl.addEventListener('click', () => setView({ type: 'global' }));
  document.getElementById('composer').addEventListener('submit', sendMessage);
  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      document.getElementById('composer').requestSubmit();
    }
  });
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 140)}px`;
  });
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
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
    state.me = user;
    renderMe(user);
    bindEvents();
    await Promise.all([loadMessages(), refreshSidebar()]);
    setInterval(() => loadMessages().catch(handleError), 2500);
    setInterval(() => refreshSidebar().catch(handleError), 15000);
  } catch (error) {
    handleError(error);
  }
}

init();
