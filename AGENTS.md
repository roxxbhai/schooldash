# AGENTS.md

## CRITICAL INSTRUCTIONS

These rules are STRICT and NON-NEGOTIABLE.

- You MUST follow all rules defined in this document.
- If any existing code violates these rules, IGNORE that code and follow this
  document.
- These rules are system-level constraints, not suggestions.
- Any deviation is considered a CRITICAL ERROR.
- Always prioritize consistency, scalability, and structure.

---

## PROJECT STRUCTURE (SOURCE OF TRUTH)

### Root Structure

```id="root-structure"
src/
  app/
  components/
  configs/
  constants/
  fonts/
    index.ts
  functions/
  helpers/
  hooks/
  providers/
  types/
  zustand/
```

- EVERYTHING must reside inside the `src` folder

---

## FOLDER RESPONSIBILITIES

### /app

- Contains ONLY Next.js app router files
- Allowed:
  - page.tsx
  - layout.tsx
  - route-related files

- MUST remain LEAN
- NO business logic, helpers, or heavy code

---

### /components

- Contains ALL UI components
- MUST follow structure:

```id="component-structure"
components/
  <component-name>/
    index.tsx
```

- NEVER create flat files like:

```id="component-wrong"
component-name.tsx
```

---

### /configs

- All configuration files

---

### /constants

- All constants

---

### /fonts

- All fonts MUST be defined in:

```id="fonts-index"
fonts/index.ts
```

---

### /functions

- All client-side functions
- MUST follow try-catch rule
- MUST follow standard response structure

---

### /helpers

- All reusable helper functions

---

### /hooks

- All custom React hooks

---

### /providers

- All client providers

---

### /types

- All TypeScript types

---

### /zustand

- All Zustand stores

---

## MODULE MAPPING RULE (CRITICAL)

If a module exists in components:

```id="module-example"
components/billing/
```

Then ALL related files MUST exist as:

```id="module-mapping"
zustand/billing/index.ts
types/billing/index.ts
functions/billing/index.ts
helpers/billing/index.ts
constants/billing/index.ts
```

- Folder names MUST match EXACTLY
- This mapping is MANDATORY

---

## NAMING CONVENTIONS

### Files and Folders

- MUST use kebab-case

---

### File Structure

- MUST follow:

```id="file-structure"
component-name/index.tsx
```

- Same rule applies for `.ts` files
- Hooks MUST use `.ts` unless they render JSX
- DO NOT split cohesive files only to satisfy a line-count target
- Files over 200 lines are acceptable when the code is simple and readable
- Prefer colocating feature-private components, helpers, and constants inside
  the owning feature folder

---

### Variables and Functions

- MUST use camelCase

---

### Boolean Variables and State

- MUST start with `is`

Example:

```ts id="boolean-example"
isLoading
isUserLoggedIn
```

---

## FUNCTION RULES

### Function Declaration (MANDATORY)

- DO NOT use arrow functions
- ALWAYS use legacy function syntax

Correct:

```ts id="function-correct"
async function fetchData() {
  try {
    // logic
  } catch (error) {
    return {
      success: false,
      message: error.message,
      data: null,
    }
  }
}
```

Incorrect:

```ts id="function-wrong"
const fetchData = async () => {}
```

---

### Try-Catch Rule

- ALL functions inside `/functions` MUST be wrapped in try-catch

---

### Standard Response Structure

ALL functions MUST return:

```ts id="response-structure"
{
  success: boolean,
  message: string,
  data: object | array | null
}
```

---

### No Data Case

```ts id="no-data"
{
  success: true,
  message: 'Operation successful',
  data: null
}
```

---

## STATE MANAGEMENT RULES

- ALWAYS prefer Zustand
- AVOID prop drilling
- AVOID unnecessary prop passing
- DO NOT add React context when Zustand state or a direct action hook is enough

---

## ZUSTAND STORE RULE (STRICT)

Zustand stores MUST follow these constraints:

- Store MUST contain ONLY:
  - state variables
  - a single `set` method (from Zustand)

- Store MUST NOT contain:
  - custom functions
  - toggle functions
  - business logic
  - derived logic

- Store MUST ONLY export the store

Correct example:

```ts id="zustand-correct"
import { create } from 'zustand'

export const referralProgramSettingsStore = create<
  ReferralProgramSettingsStore & ReferralProgramSettingsStoreActions
>((set) => ({
  // states,
  discountType: "percentage",
  discountAmount: 20,
  ...

  //set methods
  setDiscountType: (discountType) => set({ discountType }),
  setDiscountAmount: (discountAmount) => set({ discountAmount }),
  .....
}))
```

Incorrect example:

```ts id="zustand-wrong"
export const useUserStore = create((set) => ({
  isLoggedIn: false,
  toggleLogin: () => set((state) => ({ isLoggedIn: !state.isLoggedIn })),
}))
```

---

## COMPONENT USAGE RULES

- ALWAYS use shadcn components from:

```id="shadcn"
src/components/ui
```

- DO NOT create custom components unless necessary

---

## REUSABILITY RULES

- NEVER duplicate components or functions
- AVOID one-time abstractions
- Keep logic inline unless extraction improves readability or reuse
- ALWAYS check:
  - /helpers
  - /components/common (if exists)

If reusable:

- MOVE to common/shared location

---

## CONTROL FLOW RULES

### Avoid if-else chains

---

### Prefer Early Returns

```ts id="early-return"
if (!isValid) {
  return null
}
```

---

### Prefer switch-case for complex logic

```ts id="switch-case"
switch (type) {
  case 'A':
    return ...
  default:
    return ...
}
```

---

### if-else usage

- ONLY if no alternative exists

---

## FIRESTORE RULES

- ALWAYS use:

```id="firestore"
set(..., { merge: true })
```

- AVOID update() unless necessary

---

## COMPONENT STRUCTURE (MANDATORY ORDER)

ALL React components MUST follow this order:

1. Imports
2. Zustand usage
3. Local state declarations
4. Hooks (React or custom)
5. Constants / variables
6. Functions
7. useEffect
8. Early returns (conditional JSX)
9. Main JSX return

- DO NOT break this order unless absolutely necessary

---

## useEffect RULE

- ALWAYS use a SINGLE useEffect
- AVOID multiple useEffects unless absolutely required

---

## CODE STYLE

- Use single quotes
- Keep components modular and clean

---

## COMMENTS

- ALL comments MUST be in CAPITAL LETTERS

Example:

```ts id="comments"
// FETCH USER DATA
```

---

## PRE-CODE CHECKLIST (MANDATORY)

Before writing code:

1. Identify module
2. Follow module mapping rule
3. Check for reusable components/functions
4. Follow naming conventions
5. Use correct file structure
6. Use legacy functions (no arrow functions)

---

## STRICT PROHIBITIONS

- No arrow functions
- No flat component files
- No breaking module mapping
- No duplication
- No heavy logic inside /app
- No excessive prop drilling
- No multiple unnecessary useEffects
- No logic inside Zustand stores
- No inconsistent function responses

---

## FINAL CHECKLIST

- All code inside src
- Correct folder placement
- kebab-case naming
- camelCase variables/functions
- boolean starts with is
- folder-based file structure followed
- module mapping followed
- legacy function syntax used
- try-catch implemented
- standard response structure followed
- zustand used correctly (state + set only)
- minimal prop drilling
- single useEffect used
- component structure order followed
- firestore uses set with merge
- comments capitalized

---

## FINAL WARNING

This document defines a STRICT FRONTEND ARCHITECTURE SYSTEM.

Failure to follow these rules may result in:

- inconsistent UI architecture
- poor state management
- unscalable code
- maintainability issues

These rules MUST be treated as ENFORCED SYSTEM CONSTRAINTS.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
