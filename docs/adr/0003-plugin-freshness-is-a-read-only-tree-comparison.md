# 0003: Plugin freshness is a read-only tree comparison

Accepted September 14, 2026.

`agentroles install --check <role>` compares the current role's `skills/` tree
with Codex's installed `0.0.0` plugin copy. It prints a versioned JSON result
with `installed`, `fresh`, and sorted `missing`, `extra`, and `changed` file or
directory paths relative to `skills/`. File bytes are compared but never
printed.

The check reads the role and `$CODEX_HOME/plugins/cache` directly. It does not
render the marketplace, launch Codex, or read or write Codex configuration.
Exit zero means the plugin is installed and fresh; stale or absent copies exit
one. `agentroles install <role>` remains the sole mutating path and continues
to leave every installed role plugin disabled globally.
