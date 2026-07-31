# Changelog

All notable changes are documented here. Format: `YYYY-MM-DD · vX.Y.Z`

---

## 2026-07-31 · v2.1.0

### Admin cabinet — major update

**New: Board tab (Доска)**
- Full listing management with list and grid view
- Filters by status, category, search, author
- Sorting: newest / oldest / price ascending / price descending
- Quick actions directly from the list: approve, reject, request changes, archive
- Inline comment forms for reject/request-changes actions
- Detail panel per listing with images, description, moderation comment
- Pagination (30 per page)
- Refresh button, toast notifications on actions

**New: Author filter**
- "View listings" button on each user card in the Users tab
- Navigates to the Board tab with author pre-filtered
- Active filter chip with one-click clear

**New: Tab badges**
- Live pending count on the Moderation tab
- Live open-reports count on the Reports tab
- Fetched via `/api/admin/counts`

**New: Missing tabs added**
- "Риски" (Risk) and "Журнал" (Audit log) tabs were missing from navigation — added

**Improved: All admin views**
- Refresh button (↻) on every section
- Consistent `admin-view-header` layout

**Improved: Users tab**
- Paginated load-more (50 per page) replacing the hard 50-item limit
- User cards show listing count with direct link to Board

**Improved: Settings tab**
- New field: "Invite URL" (link to join the Telegram group)
- New field: "Default currency" (select from 10 currencies)

**Improved: Admin board actions**
- Toast notifications replace inline error messages
- Actions: publish, reject (with reason), request changes (with comment), archive

**Backend**
- `GET /api/admin/counts` — pending listings + open reports counts
- `GET /api/admin/listings` — added `authorId` filter param
- `GET /api/admin/listings` — now includes full `images` array
- `GET /api/admin/categories` — now includes listing count per category
- `GET /api/admin/audit-log` — includes `targetUser` name, limit 200

**CSS**
- `.tab-badge`, `.admin-refresh-btn`, `.admin-view-header`, `.admin-load-more`
- `.user-view-listings-btn`, `.admin-toast`, `.board-author-filter-chip`

---

## 2026-07 · v2.0.0

- Adnecta 2.0 release — web dashboard experience
- Community administration moved to web (from Telegram bot)
- Localized owner and public dashboards
- Multilingual community boards
- Platform dashboard navigation
- Owner onboarding redesign

---

## Earlier

See git log for pre-2.0 history.
