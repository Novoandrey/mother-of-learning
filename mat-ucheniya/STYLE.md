# STYLE.md — Design Tokens

> Source of truth for all UI styles. Constitution XI: "реюзай, не городи".
> If your className doesn't match a token below — stop and check.
> Updated: 2026-04-13

## Inputs

All text inputs, textareas, selects, number inputs.

```
rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none
```

Textarea additions: `resize-y`, `font-mono` (for code/markdown).

## Buttons

### Primary (full)
```
rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors
```

### Primary (compact — in headers, nav)
```
rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors
```

### Secondary
```
rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors
```

### Secondary (compact — "Редактировать" in headers)
```
rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors
```

### Text link button
```
text-sm text-blue-600 hover:underline
```

### Danger text button
```
text-sm text-red-500 hover:text-red-700
```

## Cards & Containers

### Standard card
```
rounded-lg border border-gray-200 bg-white p-4
```

For larger sections (loop detail, session recap): `p-5`.

### List row (clickable)
```
rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-gray-300 transition-colors
```

### Editing state (inline forms)
```
rounded-lg border border-blue-200 bg-blue-50/50 p-3
```

## Typography

### Page heading
```
text-2xl font-bold text-gray-900
```

### Section header (uppercase label)
```
text-xs font-semibold uppercase tracking-wide text-gray-400
```

### Back link
```
text-sm text-gray-400 hover:text-gray-600 transition-colors
```

## Chips & Filters

### Active
```
rounded-full px-3 py-1 text-sm font-medium bg-gray-900 text-white transition-colors
```

### Inactive
```
rounded-full px-3 py-1 text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors
```

## Tags (on entity cards)
```
rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600
```

## Empty States
```
rounded-lg border border-dashed border-gray-200 py-12 text-center
```

Text inside: `text-gray-400` or `text-gray-500`.

## Error Messages
```
text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2
```

## Sidebar

Search input uses the standard input token.
Type headers: standard section header token.
Active item: `bg-blue-50 text-blue-700 font-medium`.
Inactive item: `text-gray-700 hover:bg-gray-100`.

---

## Rules

1. **New component?** Copy tokens from here, not from another component's className.
2. **Need something not listed?** Ask first. If approved, add it here.
3. **Encounter grid cells** use minimal styling: `px-1.5 py-0.5 text-sm` for inputs, standard tokens for everything else.
