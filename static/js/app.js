// static/js/app.js

/**
 * Accounts
 * A phrase is an account. One browser may hold several of them, so the user can
 * keep separate sets of documents apart and move between them without typing a
 * phrase again.
 *
 * localStorage layout:
 *   accounts         [{ id, label, phrase, tabs, activeTabId }]
 *   activeAccountId  the entry whose phrase is live
 *   phrase           the live phrase — unchanged, so the rest of the app is untouched
 *   openTabs         the live account's tabs — also unchanged
 *
 * The phrase is the API token, so it never reaches the DOM. The menu shows labels.
 */
const Accounts = {
    load() {
        try {
            const list = JSON.parse(localStorage.getItem('accounts') || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    },

    save(list) { localStorage.setItem('accounts', JSON.stringify(list)); },

    activeId() { return localStorage.getItem('activeAccountId') || ''; },

    _newId() { return Math.random().toString(36).slice(2, 10); },

    /**
     * Bring the store in line with the live phrase. This covers a user who signed
     * in before spaces existed, and any phrase set straight by AuthGate.submit.
     */
    migrate() {
        const phrase = localStorage.getItem('phrase');
        if (!phrase) return;
        const list = this.load();
        let entry = list.find(a => a.phrase === phrase);
        if (!entry) {
            entry = {
                id: this._newId(),
                label: `Space ${list.length + 1}`,
                phrase,
                tabs: [],
                activeTabId: 'dashboard',
            };
            list.push(entry);
            this.save(list);
        }
        if (this.activeId() !== entry.id) localStorage.setItem('activeAccountId', entry.id);
    },

    add(phrase, label) {
        const list = this.load();
        const existing = list.find(a => a.phrase === phrase);
        if (existing) {
            this.switchTo(existing.id);
            return;
        }
        const entry = {
            id: this._newId(),
            label: (label || '').trim() || `Space ${list.length + 1}`,
            phrase,
            tabs: [],
            activeTabId: 'dashboard',
        };
        list.push(entry);
        this.save(list);
        this.switchTo(entry.id);
    },

    /**
     * Park the open tabs on the space we leave, hand the app the incoming phrase,
     * then navigate. A full page load rebuilds the tabs, the SSE stream and every
     * cached pane at once, so nothing from the old space stays on screen.
     */
    switchTo(id) {
        const list = this.load();
        const target = list.find(a => a.id === id);
        if (!target) return;

        const current = list.find(a => a.id === this.activeId());
        if (current && current.id !== target.id) {
            try {
                current.tabs = JSON.parse(localStorage.getItem('openTabs') || '[]');
            } catch (e) {
                current.tabs = [];
            }
            current.activeTabId = localStorage.getItem('activeTabId') || 'dashboard';
        }
        this.save(list);

        localStorage.setItem('phrase', target.phrase);
        localStorage.setItem('activeAccountId', target.id);
        localStorage.setItem('openTabs', JSON.stringify(target.tabs || []));
        localStorage.setItem('activeTabId', target.activeTabId || 'dashboard');

        // Go to the root rather than reload — the current URL may point at a
        // document that belongs to the space we are leaving.
        window.location.href = '/';
    },

    /** The live phrase. Used only by the copy and reveal controls. */
    activePhrase() { return localStorage.getItem('phrase') || ''; },

    rename(id, label) {
        const clean = (label || '').trim().slice(0, 24);
        if (!clean) return;
        const list = this.load();
        const entry = list.find(a => a.id === id);
        if (!entry) return;
        entry.label = clean;
        this.save(list);
    },

    /**
     * Forget the current space on this device. The documents stay on the server,
     * and the phrase brings them back. Falls back to the next space if one exists.
     */
    signOutCurrent() {
        const remaining = this.load().filter(a => a.id !== this.activeId());
        this.save(remaining);
        localStorage.removeItem('openTabs');
        localStorage.removeItem('activeTabId');
        localStorage.removeItem('activeAccountId');

        if (remaining.length) {
            this.switchTo(remaining[0].id);
            return;
        }
        localStorage.removeItem('phrase');
        window.location.href = '/';
    }
};

/**
 * Auth Gate
 * Manages phrase-based authentication. Phrase is stored in localStorage
 * and sent as Authorization: Bearer <phrase> on every request.
 */
class AuthGate {
    // 'signin' when nobody is signed in, 'add' when an existing user adds a space.
    static mode = 'signin';

    static show() {
        const gate = document.getElementById('auth-gate');
        if (gate) gate.style.display = 'flex';
    }

    static hide() {
        const gate = document.getElementById('auth-gate');
        if (gate) gate.style.display = 'none';
    }

    static getPhrase() {
        return localStorage.getItem('phrase') || '';
    }

    static getHeaders() {
        const phrase = this.getPhrase();
        return phrase ? { 'Authorization': `Bearer ${phrase}` } : {};
    }

    static clear() {
        localStorage.removeItem('phrase');
        this.closeAdd();
        this.show();
    }

    static signOut() {
        Accounts.signOutCurrent();
    }

    /**
     * Reuse the gate to add a second space. Same fields, different wording, and
     * an optional label so the menu lists something better than "Space 2".
     */
    static openAdd() {
        this.mode = 'add';
        const title = document.querySelector('.auth-gate-title');
        const subtitle = document.querySelector('.auth-gate-subtitle');
        const hint = document.querySelector('.auth-gate-hint');
        const label = document.getElementById('auth-label-input');
        const input = document.getElementById('auth-phrase-input');
        const error = document.getElementById('auth-error');

        // Keep the sign-in wording so closeAdd can put it back. A 401 later reopens
        // this same gate, and it must not still say "Add a space".
        if (!this._defaults) {
            this._defaults = {
                title: title ? title.textContent : '',
                subtitle: subtitle ? subtitle.textContent : '',
                hint: hint ? hint.innerHTML : '',
            };
        }

        if (title) title.textContent = 'Add a space';
        if (subtitle) subtitle.textContent = 'Another phrase, another set of documents.';
        if (hint) hint.textContent = 'This device remembers both. Press Escape to go back.';
        if (label) { label.hidden = false; label.value = ''; }
        if (input) input.value = '';
        if (error) error.textContent = '';

        this.show();
        if (input) input.focus();
    }

    /** Leave add mode and put the gate back the way the sign-in screen needs it. */
    static closeAdd() {
        if (this.mode !== 'add') return;
        this.mode = 'signin';
        const label = document.getElementById('auth-label-input');
        if (label) { label.hidden = true; label.value = ''; }

        const d = this._defaults;
        if (d) {
            const title = document.querySelector('.auth-gate-title');
            const subtitle = document.querySelector('.auth-gate-subtitle');
            const hint = document.querySelector('.auth-gate-hint');
            if (title) title.textContent = d.title;
            if (subtitle) subtitle.textContent = d.subtitle;
            if (hint) hint.innerHTML = d.hint;
        }
        this.hide();
    }

    static async submit() {
        const input = document.getElementById('auth-phrase-input');
        const errorEl = document.getElementById('auth-error');
        const btn = document.getElementById('auth-submit-btn');
        const phrase = input?.value.trim();

        if (!phrase) return;

        if (phrase.length < 12) {
            if (errorEl) errorEl.textContent = 'Passphrase must be at least 12 characters.';
            return;
        }

        btn.disabled = true;
        btn.textContent = '...';
        if (errorEl) errorEl.textContent = '';

        try {
            const res = await fetch('/api/auth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phrase }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const msg = Array.isArray(data?.detail)
                    ? data.detail[0]?.msg
                    : (data?.detail || 'Something went wrong.');
                throw new Error(msg);
            }

            if (this.mode === 'add') {
                const label = document.getElementById('auth-label-input');
                // add() navigates, so nothing after this runs.
                Accounts.add(phrase, label ? label.value : '');
                return;
            }

            localStorage.setItem('phrase', phrase);
            Accounts.migrate();
            window.location.reload();
        } catch (err) {
            if (errorEl) errorEl.textContent = err.message;
            btn.disabled = false;
            btn.textContent = 'Enter';
        }
    }
}

/**
 * Account Menu
 * The top-bar button and dropdown for switching space. Labels are user text, so
 * rows are built with textContent, never innerHTML.
 */
const AccountMenu = {
    render() {
        const menu = document.getElementById('acct-menu');
        const btn = document.querySelector('.tab-account');
        if (!menu) return;

        const list = Accounts.load();
        const activeId = Accounts.activeId();
        const active = list.find(a => a.id === activeId);
        const label = (active && active.label) || 'Space';

        if (btn) {
            btn.textContent = label.charAt(0).toUpperCase() || 'S';
            btn.title = `Space: ${label}`;
            btn.setAttribute('aria-label', `Space: ${label}. Switch space`);
        }

        menu.innerHTML = `
            <p class="acct-menu-head">Spaces on this device</p>
            <div class="acct-list" id="acct-list"></div>
            <div class="acct-menu-sep"></div>
            <div class="acct-phrase-row">
                <span class="acct-phrase-label">Space phrase</span>
                <button class="acct-mini" data-action="copy-phrase"
                        title="Copy phrase" aria-label="Copy phrase">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
                <button class="acct-mini" data-action="reveal-phrase" aria-pressed="false"
                        title="Show phrase" aria-label="Show phrase">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
            </div>
            <div class="acct-phrase-box" id="acct-phrase-box" hidden></div>
            <div class="acct-menu-sep"></div>
            <button class="doc-menu-item" data-action="add-account">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg><span>Add a space</span>
            </button>
            <button class="doc-menu-item" data-action="signout-account">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg><span>Sign out of this space</span>
            </button>`;

        const listEl = menu.querySelector('#acct-list');
        list.forEach(a => {
            const isActive = a.id === activeId;
            const row = document.createElement('button');
            row.className = 'doc-menu-item acct-row' + (isActive ? ' is-active' : '');
            row.dataset.acctId = a.id;
            row.dataset.action = isActive ? 'rename-account' : 'switch-account';

            const dot = document.createElement('span');
            dot.className = 'acct-dot';
            const name = document.createElement('span');
            name.className = 'acct-name';
            name.textContent = a.label;
            row.append(dot, name);

            if (isActive) {
                const hint = document.createElement('span');
                hint.className = 'acct-hint';
                hint.textContent = 'rename';
                row.appendChild(hint);
            }
            listEl.appendChild(row);
        });
    },

    /**
     * Copy is the first-class action here. It moves the phrase to another device
     * without ever drawing it, so nobody beside the user reads it off the screen.
     */
    copyPhrase(btn) {
        const phrase = Accounts.activePhrase();
        if (!phrase) return;
        navigator.clipboard.writeText(phrase).then(() => {
            if (!btn) return;
            const original = btn.innerHTML;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = original;
                btn.classList.remove('copied');
            }, 1500);
        });
    },

    /**
     * Show the phrase for a short time. It is a bearer token, so it stays out of
     * the DOM until the user asks, and it goes back out on a timer, on a second
     * click, and whenever the menu closes.
     */
    revealPhrase(btn) {
        const box = document.getElementById('acct-phrase-box');
        if (!box) return;
        if (!box.hidden) { this.hidePhrase(); return; }

        const phrase = Accounts.activePhrase();
        if (!phrase) return;

        const text = document.createElement('code');
        text.className = 'acct-phrase-text';
        text.textContent = phrase;
        const warn = document.createElement('p');
        warn.className = 'acct-phrase-warn';
        warn.textContent = 'Anyone with this phrase can read this space.';
        box.append(text, warn);
        box.hidden = false;
        if (btn) btn.setAttribute('aria-pressed', 'true');

        clearTimeout(this._revealTimer);
        this._revealTimer = setTimeout(() => AccountMenu.hidePhrase(), 15000);
    },

    hidePhrase() {
        clearTimeout(this._revealTimer);
        const box = document.getElementById('acct-phrase-box');
        const btn = document.querySelector('[data-action="reveal-phrase"]');
        if (box) { box.textContent = ''; box.hidden = true; }
        if (btn) btn.setAttribute('aria-pressed', 'false');
    },

    toggle(btn) {
        const menu = document.getElementById('acct-menu');
        if (!menu) return;
        menu.classList.contains('open') ? this.close() : this.open(btn);
    },

    open(btn) {
        const menu = document.getElementById('acct-menu');
        if (!menu) return;
        DocMenu.close();
        this.render();
        menu.classList.add('open');
        if (btn) btn.setAttribute('aria-expanded', 'true');

        // Registered on the next tick so the click that opened the menu does not
        // close it again straight away.
        setTimeout(() => {
            document.addEventListener('click', AccountMenu._onOutsideClick);
            document.addEventListener('keydown', AccountMenu._onKeydown);
        }, 0);
    },

    close() {
        const menu = document.getElementById('acct-menu');
        const btn = document.querySelector('.tab-account');
        // A closed menu must never keep the phrase in the page.
        this.hidePhrase();
        if (menu) menu.classList.remove('open');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', AccountMenu._onOutsideClick);
        document.removeEventListener('keydown', AccountMenu._onKeydown);
    },

    /** Swap the active row for a text field. Enter or blur saves, Escape cancels. */
    startRename(id) {
        const row = document.querySelector(`.acct-row[data-acct-id="${id}"]`);
        const entry = Accounts.load().find(a => a.id === id);
        if (!row || !entry) return;

        const input = document.createElement('input');
        input.className = 'acct-rename';
        input.type = 'text';
        input.maxLength = 24;
        input.value = entry.label;
        row.replaceWith(input);
        input.focus();
        input.select();

        // The blur that follows a save would otherwise save a second time.
        let done = false;
        const commit = () => {
            if (done) return;
            done = true;
            Accounts.rename(id, input.value);
            AccountMenu.render();
        };
        input.addEventListener('keydown', (e) => {
            // Escape belongs to the field while renaming, not to the menu.
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { done = true; AccountMenu.render(); }
        });
        input.addEventListener('blur', commit);
    },

    _onOutsideClick(e) {
        // Renaming replaces the clicked row with a text field, so by the time this
        // runs the target may already be off the page. A detached node is not an
        // outside click — treating it as one would shut the menu mid-rename.
        if (!e.target.isConnected) return;
        const wrap = document.getElementById('acct-wrap');
        if (wrap && wrap.contains(e.target)) return;
        AccountMenu.close();
    },

    _onKeydown(e) {
        if (e.key === 'Escape') AccountMenu.close();
    }
};

/**
 * Authenticated fetch — wraps window.fetch, injects Bearer header,
 * and redirects to auth gate on 401.
 */
async function authFetch(url, options = {}) {
    const headers = {
        ...AuthGate.getHeaders(),
        ...options.headers,
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
        AuthGate.clear();
        throw new Error('Unauthorized');
    }
    return res;
}

/**
 * Tab Manager
 * Handles creating, switching, and closing tabs.
 * Integrates with History API for shareable URLs.
 */
class TabManager {
    static tabs = new Map(); // id -> { title }
    static activeTabId = 'dashboard';
    static isInitializing = true; // Flag to prevent pushState during init

    static async init() {
        // Get initial doc from server-provided data attribute
        const appMain = document.getElementById('app-main');
        const initialDocId = appMain?.dataset.initialDoc || '';

        // Restore tabs from localStorage
        const savedTabs = JSON.parse(localStorage.getItem('openTabs') || '[]');

        // Re-open saved tabs (in background, don't switch)
        savedTabs.forEach(tab => {
            this.create_tab_ui(tab.id, tab.title);
            this.create_pane_ui(tab.id);
            this.tabs.set(tab.id, { title: tab.title });
            this.load_tab_content(tab.id);
        });

        // Handle direct doc link (server passed initial_doc_id)
        if (initialDocId) {
            // Open and switch to doc tab
            this.open_doc(initialDocId, 'Loading...');
        } else {
            // Default to dashboard
            this.switch('dashboard');
        }

        this.isInitializing = false;

        // Handle browser back/forward
        window.addEventListener('popstate', () => this.handlePopState());

        // Keyboard shortcut: Alt+W to close all tabs
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'w') {
                this.closeAll();
            }
        });
    }

    static handlePopState() {
        const path = window.location.pathname;
        if (path === '/' || path === '') {
            this.switchWithoutHistory('dashboard');
        } else if (path.startsWith('/doc/')) {
            const docId = path.split('/doc/')[1];
            // Validate — IDs are 16 hex chars; reject anything else to prevent XSS
            if (docId && /^[0-9a-f]{16}$/.test(docId)) {
                if (this.tabs.has(docId)) {
                    this.switchWithoutHistory(docId);
                } else {
                    // Tab doesn't exist, create it
                    this.create_tab_ui(docId, 'Loading...');
                    this.create_pane_ui(docId);
                    this.tabs.set(docId, { title: 'Loading...' });
                    this.load_tab_content(docId);
                    this.switchWithoutHistory(docId);
                }
            } else {
                this.switchWithoutHistory('dashboard');
            }
        }
    }

    static saveState() {
        const tabsData = Array.from(this.tabs.entries()).map(([id, data]) => ({
            id,
            title: data.title
        }));
        localStorage.setItem('openTabs', JSON.stringify(tabsData));
        localStorage.setItem('activeTabId', this.activeTabId);
    }

    /**
     * Open a document in a tab AND switch to it.
     */
    static open_doc(docId, title) {
        if (this.tabs.has(docId)) {
            this.switch(docId);
            return;
        }

        this.create_tab_ui(docId, title);
        this.create_pane_ui(docId);

        this.tabs.set(docId, { title });
        this.saveState();

        this.load_tab_content(docId);
        this.switch(docId);
    }

    /**
     * Open a document in a tab WITHOUT switching (for SSE).
     */
    static open_doc_background(docId, title) {
        if (this.tabs.has(docId)) {
            this.load_tab_content(docId);
            return;
        }

        this.create_tab_ui(docId, title);
        this.create_pane_ui(docId);

        this.tabs.set(docId, { title });
        this.saveState();

        this.load_tab_content(docId);
    }

    static create_tab_ui(docId, title) {
        const tabStrip = document.getElementById('tab-strip');
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.tabId = docId;
        tab.onclick = () => this.switch(docId);

        // Build tab using DOM to avoid HTML entity issues
        tab.innerHTML = `
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
      </span>
      <span class="tab-title"></span>
      <span class="tab-close" onclick="event.stopPropagation(); TabManager.close('${docId}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </span>
    `;
        // Set title using textContent to preserve special characters
        tab.querySelector('.tab-title').textContent = title;
        // Add tooltip for desktop hover
        tab.title = title;
        tabStrip.appendChild(tab);
    }

    static create_pane_ui(docId) {
        const main = document.getElementById('app-main');
        const pane = document.createElement('div');
        pane.className = 'tab-pane';
        pane.id = `pane-${docId}`;
        pane.innerHTML = `<div class="loading">Loading doc...</div>`;
        main.appendChild(pane);
    }

    static async load_tab_content(docId) {
        const pane = document.getElementById(`pane-${docId}`);
        if (!pane) return;

        try {
            const res = await authFetch(`/doc/${docId}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });

            // Ghost tab — document deleted while tab was open; close silently
            if (res.status === 404) {
                this.close(docId);
                return;
            }

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const html = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const content = doc.querySelector('.doc-view-container');
            if (!content) throw new Error("Content not found");

            pane.innerHTML = '';
            pane.appendChild(content);

            // The pane now carries a fresh .doc-menu-source, so rebuild the top-bar
            // menu. Only for the visible tab — a background refresh must not swap
            // the menu out from under the document the user is looking at.
            if (this.activeTabId === docId) DocMenu.sync();

            // Update tab title from the fetched page's <title>, which the server
            // fills with the real doc title. The old code read an <h1> out of
            // .doc-view-container, but markdown has not been rendered into it yet at
            // this point and HTML docs have no <h1> there at all — so a tab opened by
            // direct URL stayed named "Loading..." and was saved that way.
            const fetchedTitle = (doc.title || '').trim();
            if (fetchedTitle) {
                this.tabs.set(docId, { title: fetchedTitle });
                const tabEl = document.querySelector(`.tab[data-tab-id="${docId}"] .tab-title`);
                if (tabEl) tabEl.textContent = fetchedTitle;
                if (this.activeTabId === docId) document.title = fetchedTitle;
                this.saveState();
            }

            // Render Markdown with XSS protection
            const rawScript = pane.querySelector('.raw-markdown');
            if (rawScript) {
                const markdown = JSON.parse(rawScript.textContent);
                const target = pane.querySelector('.markdown-body');

                if (target && typeof marked !== 'undefined') {
                    marked.setOptions({
                        highlight: function (code, lang) {
                            if (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
                                return hljs.highlight(code, { language: lang }).value;
                            }
                            return typeof hljs !== 'undefined' ? hljs.highlightAuto(code).value : code;
                        },
                        breaks: false, // FIX: No extra line breaks
                        gfm: true
                    });

                    const rawHtml = marked.parse(markdown);
                    const safeHtml = typeof DOMPurify !== 'undefined'
                        ? DOMPurify.sanitize(rawHtml)
                        : rawHtml;

                    target.innerHTML = safeHtml;

                    if (typeof hljs !== 'undefined') {
                        pane.querySelectorAll('pre code').forEach((block) => {
                            hljs.highlightElement(block);
                        });
                    }

                    // Inject copy buttons into each code block
                    pane.querySelectorAll('pre').forEach(pre => {
                        const btn = document.createElement('button');
                        btn.className = 'code-copy-btn';
                        btn.title = 'Copy code';
                        btn.setAttribute('aria-label', 'Copy code');
                        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const code = pre.querySelector('code');
                            if (!code) return;
                            navigator.clipboard.writeText(code.textContent).then(() => {
                                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                                btn.classList.add('copied');
                                setTimeout(() => {
                                    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
                                    btn.classList.remove('copied');
                                }, 1500);
                            });
                        });

                        pre.appendChild(btn);
                    });
                }
            }

        } catch (err) {
            pane.innerHTML = `<div class="loading" style="color: var(--accent-secondary);">Failed to load: ${err.message}</div>`;
        }
    }

    /**
     * Keep the browser tab title on the document the user is looking at.
     * load_tab_content sets it when a document loads, but a plain tab switch
     * loads nothing, so the title used to stay on whichever doc loaded last.
     */
    static syncPageTitle() {
        const docId = this.activeTabId;
        if (!docId || docId === 'dashboard') {
            document.title = 'Another Set of Eyes';
            return;
        }
        const title = (this.tabs.get(docId) || {}).title;
        if (title) document.title = title;
    }

    /**
     * Switch tabs AND update URL (normal user action)
     */
    static switch(docId) {
        this.activeTabId = docId;

        // Update UI
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tabId === docId);
        });
        document.querySelectorAll('.tab-pane').forEach(p => {
            p.classList.toggle('active', p.id === `pane-${docId}`);
        });

        // Update URL (only if not initializing)
        if (!this.isInitializing) {
            const newUrl = docId === 'dashboard' ? '/' : `/doc/${docId}`;
            if (window.location.pathname !== newUrl) {
                history.pushState({ docId }, '', newUrl);
            }
        }

        this.saveState();
        this.syncPageTitle();
        DocMenu.sync();
    }

    /**
     * Switch tabs without updating URL (for popstate handling)
     */
    static switchWithoutHistory(docId) {
        this.activeTabId = docId;

        document.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tabId === docId);
        });
        document.querySelectorAll('.tab-pane').forEach(p => {
            p.classList.toggle('active', p.id === `pane-${docId}`);
        });

        this.saveState();
        this.syncPageTitle();
        DocMenu.sync();
    }

    static close(docId) {
        const tab = document.querySelector(`.tab[data-tab-id="${docId}"]`);
        if (tab) tab.remove();

        const pane = document.getElementById(`pane-${docId}`);
        if (pane) pane.remove();

        this.tabs.delete(docId);

        if (this.activeTabId === docId) {
            this.switch('dashboard');
        } else {
            this.saveState();
        }
    }

    static closeAllPending = false;
    static closeAllTimeout = null;

    static closeAll(button) {
        // Two-step confirmation pattern (only when button is provided)
        if (button && !this.closeAllPending) {
            // First click: enter confirm state
            this.closeAllPending = true;
            button.classList.add('confirming');

            // Reset after 3 seconds if not confirmed
            this.closeAllTimeout = setTimeout(() => {
                this.resetCloseAllButton(button);
            }, 3000);
            return;
        }

        // Second click or keyboard shortcut: execute
        if (this.closeAllTimeout) {
            clearTimeout(this.closeAllTimeout);
        }
        if (button) {
            this.resetCloseAllButton(button);
        } else {
            this.closeAllPending = false;
        }

        // Close all document tabs and switch to dashboard
        const tabIds = Array.from(this.tabs.keys());
        tabIds.forEach(id => this.close(id));
    }

    static resetCloseAllButton(button) {
        this.closeAllPending = false;
        if (button) {
            button.classList.remove('confirming');
        }
    }

    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}


/**
 * Document Manager
 * Handles document CRUD operations (delete, rename, clear all).
 */
class DocumentManager {
    // Per-doc pending state for two-step delete confirmation
    static _deletePending = new Map(); // docId -> timeoutId

    static async delete(docId, button) {
        if (!button) return;

        if (!this._deletePending.has(docId)) {
            // First click — arm the button
            button.classList.add('confirming');
            const tid = setTimeout(() => {
                button.classList.remove('confirming');
                this._deletePending.delete(docId);
            }, 3000);
            this._deletePending.set(docId, tid);
            return;
        }

        // Second click — execute
        clearTimeout(this._deletePending.get(docId));
        this._deletePending.delete(docId);
        button.classList.remove('confirming');

        try {
            const res = await authFetch(`/api/documents/${docId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');

            TabManager.close(docId);
            this.refreshList();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    static clearAllPending = false;
    static clearAllTimeout = null;

    static async clearAll(button) {
        // Two-step confirmation pattern
        if (!this.clearAllPending) {
            // First click: enter confirm state
            this.clearAllPending = true;
            button.classList.add('confirming');
            button.textContent = 'Click again to confirm';

            // Reset after 3 seconds if not confirmed
            this.clearAllTimeout = setTimeout(() => {
                this.resetClearAllButton(button);
            }, 3000);
            return;
        }

        // Second click: execute
        clearTimeout(this.clearAllTimeout);
        this.resetClearAllButton(button);

        try {
            const res = await authFetch('/api/documents', { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to clear');

            // Close all tabs
            TabManager.closeAll();

            // Refresh the list
            this.refreshList();
        } catch (err) {
            console.error('Error clearing documents:', err);
        }
    }

    static resetClearAllButton(button) {
        this.clearAllPending = false;
        button.classList.remove('confirming');
        button.textContent = 'Clear All';
    }

    static startInlineEdit(docId) {
        const docItem = document.querySelector(`.doc-item[data-doc-id="${docId}"]`);
        if (!docItem) return;

        const titleEl = docItem.querySelector('.doc-title');
        const currentTitle = titleEl.dataset.title || titleEl.textContent;

        // Replace title with input
        titleEl.innerHTML = `
            <input type="text" class="inline-edit-input" value="${this.escapeHtml(currentTitle)}"
                onkeydown="if(event.key==='Enter'){DocumentManager.saveInlineEdit('${docId}');} if(event.key==='Escape'){DocumentManager.cancelInlineEdit('${docId}', '${this.escapeHtml(currentTitle)}');}"
                onblur="DocumentManager.saveInlineEdit('${docId}')"
            />
        `;

        const input = titleEl.querySelector('input');
        input.focus();
        input.select();
    }

    static async saveInlineEdit(docId) {
        const docItem = document.querySelector(`.doc-item[data-doc-id="${docId}"]`);
        if (!docItem) return;

        const input = docItem.querySelector('.inline-edit-input');
        if (!input) return;

        const newTitle = input.value.trim();
        const titleEl = docItem.querySelector('.doc-title');
        const originalTitle = titleEl.dataset.title;

        // If no change or empty, restore original
        if (!newTitle || newTitle === originalTitle) {
            titleEl.textContent = originalTitle;
            return;
        }

        try {
            const res = await authFetch(`/api/documents/${docId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            if (!res.ok) throw new Error('Failed to rename');

            // Update inline
            titleEl.textContent = newTitle;
            titleEl.dataset.title = newTitle;

            // Update tab title if open
            const tabTitle = document.querySelector(`.tab[data-tab-id="${docId}"] .tab-title`);
            if (tabTitle) {
                tabTitle.textContent = newTitle;
            }

            // Update stored data
            if (TabManager.tabs.has(docId)) {
                TabManager.tabs.set(docId, { title: newTitle });
                TabManager.saveState();
            }
        } catch (err) {
            titleEl.textContent = originalTitle;
            console.error('Rename failed:', err);
        }
    }

    static cancelInlineEdit(docId, originalTitle) {
        const docItem = document.querySelector(`.doc-item[data-doc-id="${docId}"]`);
        if (!docItem) return;

        const titleEl = docItem.querySelector('.doc-title');
        titleEl.textContent = originalTitle;
    }

    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static async archive(docId, fromDocView = false) {
        try {
            const res = await authFetch(`/api/documents/${docId}/archive`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to archive');

            this.refreshList();

            if (fromDocView) {
                // Reload tab content so the Archive button flips to Unarchive
                await TabManager.load_tab_content(docId);
            }
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    static async unarchive(docId, fromDocView = false) {
        try {
            const res = await authFetch(`/api/documents/${docId}/unarchive`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to unarchive');

            this.refreshList();

            if (fromDocView) {
                await TabManager.load_tab_content(docId);
            }
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    static refreshList() {
        if (typeof htmx !== 'undefined') {
            htmx.trigger('#document-list', 'refresh');
        }
    }

    static async reloadDashboard() {
        // When visiting /doc/{id} directly, the dashboard pane gets polluted
        // with doc content from server-side render. This reloads it properly.
        const pane = document.getElementById('pane-dashboard');
        if (!pane) return;

        try {
            const res = await fetch('/'); // dashboard shell needs no auth
            if (!res.ok) return;

            const html = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Extract the dashboard content
            const dashboardContent = doc.querySelector('.dashboard-container');
            if (dashboardContent) {
                pane.innerHTML = '';
                pane.appendChild(dashboardContent);

                // Re-initialize HTMX for the new content
                if (typeof htmx !== 'undefined') {
                    htmx.process(pane);
                }
            }
        } catch (err) {
            console.error('Failed to reload dashboard:', err);
        }
    }
}


/**
 * SSE Client
 * Listens for new documents and auto-opens them in background.
 * Reconnects automatically with exponential backoff on disconnection.
 */
class SSEClient {
    static _retryDelay = 1000;
    static _maxRetryDelay = 30000;

    static connect() {
        const phrase = AuthGate.getPhrase();
        const evtSource = new EventSource(`/api/documents/stream?token=${encodeURIComponent(phrase)}`);

        evtSource.onopen = () => {
            this._retryDelay = 1000;
        };

        evtSource.onerror = () => {
            evtSource.close();

            // Reconnect with exponential backoff (1s → 2s → 4s … capped at 30s)
            setTimeout(() => {
                this._retryDelay = Math.min(this._retryDelay * 2, this._maxRetryDelay);
                this.connect();
            }, this._retryDelay);
        };

        evtSource.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            const { id, title } = msg.data || {};

            const refreshList = () => {
                if (typeof htmx !== 'undefined') {
                    htmx.trigger('#document-list', 'refresh');
                }
            };

            switch (msg.type) {
                case 'new_document':
                    refreshList();
                    // Open tab in background (no switch)
                    TabManager.open_doc_background(id, title);
                    break;

                case 'document_updated':
                    // Re-pushing the same file path fires this. Reload the tab in
                    // place so a second screen updates without being touched.
                    refreshList();
                    if (TabManager.tabs.has(id)) TabManager.load_tab_content(id);
                    break;

                case 'document_deleted':
                    refreshList();
                    if (TabManager.tabs.has(id)) TabManager.close(id);
                    break;

                case 'documents_cleared':
                    refreshList();
                    Array.from(TabManager.tabs.keys()).forEach(tid => TabManager.close(tid));
                    break;
            }
        };
    }
}

/**
 * Document Creator
 * Manages the slide-out panel for manually pushing a new document or updating an existing one.
 */
class DocumentCreator {
    static editingDocId = null;

    static open() {
        this.editingDocId = null;
        const panel = document.getElementById('push-panel');
        const backdrop = document.getElementById('push-backdrop');
        if (!panel || !backdrop) return;

        // Reset text and inputs
        const titleText = document.getElementById('push-panel-title');
        const submitBtn = document.getElementById('push-submit');
        if (titleText) titleText.textContent = 'New Document';
        if (submitBtn) submitBtn.textContent = 'Push Document';
        
        const titleInput = document.getElementById('push-title');
        const contentInput = document.getElementById('push-content');
        if (titleInput) titleInput.value = '';
        if (contentInput) contentInput.value = '';

        panel.classList.add('open');
        backdrop.classList.add('open');

        // Focus the title input
        if (titleInput) setTimeout(() => titleInput.focus(), 50);
    }

    static async edit(docId) {
        this.editingDocId = docId;
        const panel = document.getElementById('push-panel');
        const backdrop = document.getElementById('push-backdrop');
        if (!panel || !backdrop) return;

        // Change header and button text
        const titleText = document.getElementById('push-panel-title');
        const submitBtn = document.getElementById('push-submit');
        if (titleText) titleText.textContent = 'Edit Document';
        if (submitBtn) submitBtn.textContent = 'Update Document';

        panel.classList.add('open');
        backdrop.classList.add('open');

        const titleInput = document.getElementById('push-title');
        const contentInput = document.getElementById('push-content');

        // Try DOM first — tab already loaded
        const contentEl = document.querySelector(`#pane-${docId} .raw-markdown`);
        if (contentEl) {
            const tabData = TabManager.tabs.get(docId);
            if (titleInput) titleInput.value = tabData ? tabData.title : '';
            if (contentInput) contentInput.value = JSON.parse(contentEl.textContent);
            if (titleInput) setTimeout(() => titleInput.focus(), 50);
            return;
        }

        // Tab not open — fetch from API
        if (titleInput) titleInput.value = '';
        if (contentInput) contentInput.value = 'Loading...';
        contentInput.disabled = true;

        try {
            const res = await authFetch(`/api/documents/${docId}`);
            if (res.ok) {
                const doc = await res.json();
                if (titleInput) titleInput.value = doc.title;
                if (contentInput) contentInput.value = doc.content;
            }
        } catch (err) {
            console.error('Failed to load document for editing:', err);
        } finally {
            contentInput.disabled = false;
        }

        if (titleInput) setTimeout(() => titleInput.focus(), 50);
    }

    static close() {
        const panel = document.getElementById('push-panel');
        const backdrop = document.getElementById('push-backdrop');
        if (!panel || !backdrop) return;

        panel.classList.remove('open');
        backdrop.classList.remove('open');

        // Clear error message only; keep form values in case user re-opens
        const error = document.getElementById('push-error');
        if (error) error.textContent = '';
    }

    static async submit() {
        const titleInput = document.getElementById('push-title');
        const contentInput = document.getElementById('push-content');
        const submitBtn = document.getElementById('push-submit');
        const errorEl = document.getElementById('push-error');

        const title = titleInput?.value.trim();
        const content = contentInput?.value.trim();

        // Validate
        if (!title) {
            if (errorEl) errorEl.textContent = 'Title is required.';
            titleInput?.focus();
            return;
        }
        if (!content) {
            if (errorEl) errorEl.textContent = 'Content is required.';
            contentInput?.focus();
            return;
        }

        // Loading state
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = this.editingDocId ? 'Updating...' : 'Pushing...';
        }
        if (errorEl) errorEl.textContent = '';

        try {
            let res;
            if (this.editingDocId) {
                res = await authFetch(`/api/documents/${this.editingDocId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, content })
                });
            } else {
                res = await authFetch('/api/documents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        content,
                        metadata: { source: 'manual' }
                    })
                });
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || `HTTP ${res.status}`);
            }

            const doc = await res.json();

            // Close panel and clear form
            this.close();
            titleInput.value = '';
            contentInput.value = '';

            if (this.editingDocId) {
                // Refresh the tab content safely
                await TabManager.load_tab_content(this.editingDocId);
                // Also rename tab just in case title changed
                TabManager.tabs.set(this.editingDocId, { title: doc.title });
                const tabTitle = document.querySelector(`.tab[data-tab-id="${this.editingDocId}"] .tab-title`);
                if (tabTitle) tabTitle.textContent = doc.title;
                TabManager.saveState();
            } else {
                // Open new doc in a tab and switch to it
                TabManager.open_doc(doc.id, doc.title);
            }

            // Refresh dashboard list
            DocumentManager.refreshList();

        } catch (err) {
            if (errorEl) errorEl.textContent = `Error: ${err.message}`;
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = this.editingDocId ? 'Update Document' : 'Push Document';
            }
        }
    }
}


/**
 * Agent Install
 * Handles the install command copy button on the dashboard.
 */
const AgentInstall = {
    copy() {
        navigator.clipboard.writeText('npx asoe-install').then(() => {
            const icon = document.getElementById('copy-icon');
            if (!icon) return;
            icon.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
            setTimeout(() => {
                icon.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>';
            }, 1500);
        });
    },

    togglePopover(btn) {
        const popover = document.getElementById('connect-popover');
        if (!popover) return;
        const isOpen = popover.classList.contains('open');
        popover.classList.toggle('open', !isOpen);
        if (!isOpen) {
            // Close on outside click
            setTimeout(() => {
                document.addEventListener('click', function handler(e) {
                    if (!popover.contains(e.target) && e.target !== btn) {
                        popover.classList.remove('open');
                    }
                    document.removeEventListener('click', handler);
                });
            }, 0);
        }
    }
};

/**
 * Doc Menu
 * The per-document controls live in the top bar behind a "..." button instead of
 * in a bar above the content, which cost a full row of height on every document.
 * Each doc pane carries its own <template class="doc-menu-source">; this module
 * clones the active one into the menu whenever the active tab changes.
 */
const DocMenu = {
    sync() {
        const wrap = document.getElementById('doc-menu-wrap');
        const menu = document.getElementById('doc-menu');
        if (!wrap || !menu) return;

        this.close();
        menu.innerHTML = '';

        const docId = TabManager.activeTabId;
        const pane = docId && docId !== 'dashboard'
            ? document.getElementById(`pane-${docId}`)
            : null;
        const tpl = pane ? pane.querySelector('.doc-menu-source') : null;

        // No template yet — the pane is still loading. Keep the button hidden
        // rather than showing an empty menu; load_tab_content calls sync again.
        if (!tpl) {
            wrap.hidden = true;
            return;
        }

        menu.appendChild(tpl.content.cloneNode(true));
        wrap.hidden = false;
    },

    toggle(btn) {
        const wrap = document.getElementById('doc-menu-wrap');
        const menu = document.getElementById('doc-menu');
        // Nothing to show on the dashboard, where the button is not rendered.
        if (!menu || !wrap || wrap.hidden) return;
        menu.classList.contains('open') ? this.close() : this.open(btn);
    },

    open(btn) {
        const menu = document.getElementById('doc-menu');
        if (!menu) return;
        menu.classList.add('open');
        if (btn) btn.setAttribute('aria-expanded', 'true');

        // Registered on the next tick so the click that opened the menu does not
        // immediately close it again.
        setTimeout(() => {
            document.addEventListener('click', DocMenu._onOutsideClick);
            document.addEventListener('keydown', DocMenu._onKeydown);
        }, 0);
    },

    close() {
        const menu = document.getElementById('doc-menu');
        const btn = document.querySelector('.tab-docmenu');
        if (menu) menu.classList.remove('open');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', DocMenu._onOutsideClick);
        document.removeEventListener('keydown', DocMenu._onKeydown);
    },

    _onOutsideClick(e) {
        const wrap = document.getElementById('doc-menu-wrap');
        if (wrap && wrap.contains(e.target)) return;
        DocMenu.close();
    },

    _onKeydown(e) {
        if (e.key === 'Escape') DocMenu.close();
    }
};

/**
 * Doc View
 * Manages the Active / Archived toggle in the dashboard header.
 */
const DocView = {
    /**
     * Copy the /r/{key} link. That URL carries no passphrase, so it renders on any
     * device — which is the whole point of pushing HTML rather than markdown.
     */
    copyRenderLink(renderKey, btn) {
        const url = `${window.location.origin}/r/${renderKey}`;
        navigator.clipboard.writeText(url).then(() => {
            if (!btn) return;
            const original = btn.innerHTML;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = original;
                btn.classList.remove('copied');
            }, 1500);
        });
    },

    currentStatus: 'active',

    setStatus(status, btn) {
        this.currentStatus = status;

        // Update toggle button styles
        document.querySelectorAll('.view-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.status === status);
        });

        // Update hx-get on the list container and trigger a refresh
        const list = document.getElementById('document-list');
        if (list && typeof htmx !== 'undefined') {
            list.setAttribute('hx-get', `/partials/doc-list?status=${status}`);
            htmx.process(list);
            htmx.trigger(list, 'refresh');
        }
    }
};

// Inject Authorization header into every HTMX request automatically
document.addEventListener('htmx:configRequest', (event) => {
    const phrase = AuthGate.getPhrase();
    if (phrase) {
        event.detail.headers['Authorization'] = `Bearer ${phrase}`;
    }
});

// Start
document.addEventListener('DOMContentLoaded', () => {
    // Randomise auth gate placeholder
    const _phrases = [
        'my llm hallucinates but at least it tries',
        'vibe coding until production catches fire',
        'merge conflict in production on a friday',
        'my context window is full please summarize',
        'ship it and pray it works flawlessly?',
        'the diff looks fine until it really isnt',
        'i just restarted the server and it worked?',
    ];
    const phraseInput = document.getElementById('auth-phrase-input');
    if (phraseInput) {
        phraseInput.placeholder = _phrases[Math.floor(Math.random() * _phrases.length)];
    }

    // Wire up static event listeners.
    // These replace inline onclick/onkeydown attributes removed from base.html so that
    // the CSP script-src no longer needs 'unsafe-inline'.
    const logoArea = document.querySelector('.logo-area');
    if (logoArea) logoArea.addEventListener('click', () => TabManager.switch('dashboard'));

    const dashboardTab = document.querySelector('[data-tab-id="dashboard"]');
    if (dashboardTab) dashboardTab.addEventListener('click', () => TabManager.switch('dashboard'));

    const closeAllBtn = document.querySelector('.tab-close-all');
    if (closeAllBtn) closeAllBtn.addEventListener('click', (e) => TabManager.closeAll(e.currentTarget));

    const pushClose = document.querySelector('.push-panel-close');
    if (pushClose) pushClose.addEventListener('click', () => DocumentCreator.close());

    const pushSubmit = document.getElementById('push-submit');
    if (pushSubmit) pushSubmit.addEventListener('click', () => DocumentCreator.submit());

    const pushBackdrop = document.getElementById('push-backdrop');
    if (pushBackdrop) pushBackdrop.addEventListener('click', () => DocumentCreator.close());

    const authInput = document.getElementById('auth-phrase-input');
    if (authInput) authInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') AuthGate.submit();
    });

    const labelInput = document.getElementById('auth-label-input');
    if (labelInput) labelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') AuthGate.submit();
    });

    const authBtn = document.getElementById('auth-submit-btn');
    if (authBtn) authBtn.addEventListener('click', () => AuthGate.submit());

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        // While adding a space the gate covers the app, so Escape must dismiss it.
        if (AuthGate.mode === 'add') { AuthGate.closeAdd(); return; }
        DocumentCreator.close();
    });

    // Delegated click handler for data-action elements.
    // Covers static elements and dynamically injected content (HTMX partials)
    // without needing unsafe-inline onclick attributes.
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;
        const docId = el.dataset.docId;
        switch (action) {
            case 'open-doc':       TabManager.open_doc(docId, el.dataset.docTitle); break;
            case 'rename-doc':     DocumentManager.startInlineEdit(docId); break;
            case 'edit-doc':       DocumentCreator.edit(docId); break;
            case 'archive-doc':    DocumentManager.archive(docId); break;
            case 'unarchive-doc':  DocumentManager.unarchive(docId); break;
            case 'delete-doc':     DocumentManager.delete(docId, el); break;
            case 'copy-install':   AgentInstall.copy(); break;
            case 'new-doc':        DocumentCreator.open(); break;
            case 'set-status':     DocView.setStatus(el.dataset.status, el); break;
            case 'toggle-connect': AgentInstall.togglePopover(el); break;
            case 'toggle-doc-menu': DocMenu.toggle(el); break;
            case 'toggle-account-menu': AccountMenu.toggle(el); break;
            case 'switch-account': Accounts.switchTo(el.dataset.acctId); break;
            case 'rename-account': AccountMenu.startRename(el.dataset.acctId); break;
            case 'add-account':    AccountMenu.close(); AuthGate.openAdd(); break;
            case 'signout-account': Accounts.signOutCurrent(); break;
            case 'copy-phrase':    AccountMenu.copyPhrase(el); break;
            case 'reveal-phrase':  AccountMenu.revealPhrase(el); break;
            case 'clear-all':      DocumentManager.clearAll(el); break;
        }
    });

    // Close the doc menu after the user picks an item. "Copy shareable link" asks
    // for a short delay through data-keep-open so its tick stays visible.
    document.addEventListener('click', (e) => {
        const item = e.target.closest('.doc-menu-item');
        if (!item || !item.closest('#doc-menu')) return;
        const hold = parseInt(item.dataset.keepOpen || '0', 10);
        hold > 0 ? setTimeout(() => DocMenu.close(), hold) : DocMenu.close();
    });

    // Register the live phrase as a space before anything reads the list.
    Accounts.migrate();

    if (!AuthGate.getPhrase()) {
        AuthGate.show();
        return; // Don't initialise the app until the user authenticates
    }

    AccountMenu.render();
    TabManager.init();
    SSEClient.connect();
});
