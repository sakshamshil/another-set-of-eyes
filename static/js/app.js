// static/js/app.js

/**
 * Tab Manager
 * Handles creating, switching, and closing tabs.
 * Integrates with History API for shareable URLs.
 */
class TabManager {
    static tabs = new Map(); // id -> { title }
    static activeTabId = 'dashboard';
    static isInitializing = true; // Flag to prevent pushState during init

    static init() {
        // Restore tabs from localStorage
        const savedTabs = JSON.parse(localStorage.getItem('openTabs') || '[]');

        // Re-open saved tabs (in background, don't switch)
        savedTabs.forEach(tab => {
            this.create_tab_ui(tab.id, tab.title);
            this.create_pane_ui(tab.id);
            this.tabs.set(tab.id, { title: tab.title });
            this.load_tab_content(tab.id);
        });

        // Check URL for direct links
        const path = window.location.pathname;
        if (path.startsWith('/doc/')) {
            const docId = path.split('/doc/')[1];
            if (docId) {
                // Open this doc (will create tab if needed)
                this.open_doc(docId, 'Loading...');
            }
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
            if (docId) {
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
        tab.innerHTML = `
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
      </span>
      <span class="tab-title">${this.escapeHtml(title)}</span>
      <span class="tab-close" onclick="event.stopPropagation(); TabManager.close('${docId}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </span>
    `;
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
            const res = await fetch(`/doc/${docId}`);
            if (!res.ok) throw new Error("Document not found");

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

    static closeAll() {
        const tabIds = Array.from(this.tabs.keys());
        tabIds.forEach(id => this.close(id));
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
    static async delete(docId) {
        if (!confirm('Delete this document?')) return;

        try {
            const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');

            // Close the tab if open
            TabManager.close(docId);

            // Refresh the list
            this.refreshList();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    static async clearAll() {
        try {
            const res = await fetch('/api/documents', { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to clear');

            // Close all tabs
            TabManager.closeAll();

            // Refresh the list
            this.refreshList();
        } catch (err) {
            alert('Error: ' + err.message);
        }
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
            const res = await fetch(`/api/documents/${docId}`, {
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

    static refreshList() {
        if (typeof htmx !== 'undefined') {
            htmx.trigger('#document-list', 'refresh');
        }
    }
}


/**
 * SSE Client
 * Listens for new documents and auto-opens them in background.
 */
class SSEClient {
    static connect() {
        const statusDot = document.getElementById('sse-status');
        const statusLabel = document.getElementById('sse-label');
        const evtSource = new EventSource("/api/documents/stream");

        evtSource.onopen = () => {
            statusDot.classList.add('connected');
            statusLabel.classList.add('connected');
            statusLabel.textContent = 'LIVE';
            console.log("SSE Connected");
        };

        evtSource.onerror = () => {
            statusDot.classList.remove('connected');
            statusLabel.classList.remove('connected');
            statusLabel.textContent = '...';
        };

        evtSource.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'new_document') {
                const { id, title } = msg.data;
                console.log("New Document Received:", title);

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

// Start
document.addEventListener('DOMContentLoaded', () => {
    TabManager.init();
    SSEClient.connect();
});
