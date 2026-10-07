# Project Coding Guidelines

## Pathing Convention
All internal navigation and asset links must use **root-relative paths** (starting with a leading slash).

- ✅ `href="/dashboard"`
- ✅ `href="/auth/login"`
- ❌ `href="dashboard"`
- ❌ `href="auth/login"`

**Reasoning:** Root-relative paths ensure that links work correctly regardless of the current page's depth in the URL hierarchy, always resolving from the domain root.

**Exception:** Links to the absolute root of the domain may still use `/` when specifically intending to return to the homepage from a nested route.
