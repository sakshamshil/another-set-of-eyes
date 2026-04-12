// static/js/app.js

/**
 * Auth Gate
 * Manages phrase-based authentication. Phrase is stored in localStorage
 * and sent as Authorization: Bearer <phrase> on every request.
 */
class AuthGate {
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
        this.show();
    }

    static signOut() {
        localStorage.removeItem('phrase');
        localStorage.removeItem('openTabs');
        localStorage.removeItem('activeTabId');
        window.location.reload();
    }

    static async submit() {
        const input = document.getElementById('auth-phrase-input');
        const errorEl = document.getElementById('auth-error');
        const btn = document.getElementById('auth-submit-btn');
        const phrase = input?.value.trim();

        if (!phrase) return;

        if (phrase.length < 10) {
            if (errorEl) errorEl.textContent = 'Passphrase must be at least 10 characters.';
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

            localStorage.setItem('phrase', phrase);
            window.location.reload();
        } catch (err) {
            if (errorEl) errorEl.textContent = err.message;
            btn.disabled = false;
            btn.textContent = 'Enter';
        }
    }
}

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

            // Update tab title from loaded content
            const titleEl = content.querySelector('h1');
            if (titleEl) {
                const title = titleEl.textContent;
                this.tabs.set(docId, { title });
                const tabEl = document.querySelector(`.tab[data-tab-id="${docId}"] .tab-title`);
                if (tabEl) tabEl.textContent = title;
                this.saveState();
            }

            // Render Markdown with XSS protection
            const rawScript = pane.querySelector('.raw-markdown');
            if (rawScript) {
                const markdown = rawScript.textContent;
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
        const statusDot = document.getElementById('sse-status');
        const statusLabel = document.getElementById('sse-label');
        const phrase = AuthGate.getPhrase();
        const evtSource = new EventSource(`/api/documents/stream?token=${encodeURIComponent(phrase)}`);

        evtSource.onopen = () => {
            this._retryDelay = 1000; // Reset backoff on successful connect
            statusDot.classList.add('connected');
            statusLabel.classList.add('connected');
            statusLabel.textContent = 'LIVE';
        };

        evtSource.onerror = () => {
            statusDot.classList.remove('connected');
            statusLabel.classList.remove('connected');
            statusLabel.textContent = '...';
            evtSource.close();

            // Reconnect with exponential backoff (1s → 2s → 4s … capped at 30s)
            setTimeout(() => {
                this._retryDelay = Math.min(this._retryDelay * 2, this._maxRetryDelay);
                this.connect();
            }, this._retryDelay);
        };

        evtSource.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'new_document') {
                const { id, title } = msg.data;

                // Refresh dashboard list
                if (typeof htmx !== 'undefined') {
                    htmx.trigger('#document-list', 'refresh');
                }

                // Open tab in background (no switch)
                TabManager.open_doc_background(id, title);
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
            if (contentInput) contentInput.value = contentEl.textContent;
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
 * Doc View
 * Manages the Active / Archived toggle in the dashboard header.
 */
const DocView = {
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
    if (!AuthGate.getPhrase()) {
        AuthGate.show();
        return; // Don't initialise the app until the user authenticates
    }

    TabManager.init();
    SSEClient.connect();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') DocumentCreator.close();
    });
});
