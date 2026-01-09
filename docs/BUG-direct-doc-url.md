# Bug: Direct Doc URL Navigation Issue

## Status
🟢 **Resolved**

## Description
When visiting a direct document URL (e.g., `/doc/1a3efd4f`), the page does not correctly switch to the document tab. Instead, it shows the dashboard with "Loading dashboard..." message, even though the doc tab IS created.

## Steps to Reproduce
1. Clear browser localStorage (or use incognito)
2. Visit `http://localhost:8080/doc/{valid-doc-id}` directly
3. **Expected**: Document tab is active and content is displayed
4. **Actual**: Dashboard tab is shown with "Loading dashboard..." and doc tab exists but is not active

## Root Cause Analysis
The issue involves a race condition or CSS class management problem:

1. Server renders `doc.html` which extends `base.html`
2. In `base.html`, the dashboard tab (`#pane-dashboard`) has `class="active"` hardcoded
3. JavaScript tries to remove this class and switch to the doc tab
4. Something prevents the switch from working correctly

## Attempted Fixes (All Failed)
1. ❌ Made `init()` async and awaited `reloadDashboard()`
2. ❌ Immediately cleared dashboard pane content
3. ❌ Removed `active` class from dashboard at very start of `init()`

## Possible Solutions to Explore
1. **Server-side fix**: Don't render `active` class on dashboard when URL is `/doc/{id}`
2. **CSS fix**: Use JavaScript to set initial visibility instead of relying on `active` class
3. **Timing fix**: Use `requestAnimationFrame` or `setTimeout` to ensure DOM is ready
4. **Architecture change**: Have `/doc/{id}` route render a different template that doesn't use dashboard pane

## Files Involved
- `src/templates/base.html` (line 52, 77 - hardcoded `active` class)
- `static/js/app.js` (init, switch, open_doc functions)
- `src/templates/doc.html` (extends base.html)

## Debug Suggestions
1. Add `console.log` statements in `init()`, `switch()`, and `open_doc()` to trace execution
2. Check browser DevTools to see if classes are being toggled correctly
3. Verify the pane elements exist before trying to manipulate them
