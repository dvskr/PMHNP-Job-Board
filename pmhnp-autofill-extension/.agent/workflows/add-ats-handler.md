---
description: How to add a new ATS handler from real web page inspection — zero guessing
---

# Add a New ATS Handler (From Real Pages Only)

> **Rule #1: Every selector, attribute name, and class comes from inspecting a real page. Never guess.**

## Prerequisites

- Chrome or Edge with DevTools
- A real job application URL on the target ATS (e.g., `https://company.wd5.myworkdaysite.com/...`)

---

## Phase 1: Capture Real HTML

### Step 1 — Open a real application page

// turbo-all

1. Open a real job application page on the target ATS in Chrome
2. Fill in nothing — just observe the blank form

### Step 2 — Save the raw HTML

In Chrome DevTools Console, run:

```js
// Copy the full page HTML to clipboard
copy(document.documentElement.outerHTML);
```

Or right-click → "Save page as" → "Web Page, HTML Only"

### Step 3 — Create the test fixture

Save the HTML as a fixture:

```
tests/fixtures/<ats-name>.html
```

**Clean up the fixture:**
- Remove `<script>` tags (not needed for field detection tests)
- Remove external stylesheets / CDN links
- Keep ALL form elements, labels, data attributes, aria attributes, classes
- Add a comment header identifying the source:

```html
<!--
  <ATS Name> Application Form Fixture
  Source: <real URL or ATS domain>
  Captured: <date>
  Fields: <list key fields found>
-->
```

### Step 4 — Document every form field

In DevTools, run this in the console to dump all form fields:

```js
document.querySelectorAll('input, select, textarea').forEach(el => {
    console.log({
        tag: el.tagName,
        type: el.type,
        id: el.id,
        name: el.name,
        placeholder: el.placeholder,
        ariaLabel: el.getAttribute('aria-label'),
        dataAutomationId: el.getAttribute('data-automation-id'),
        dataTestId: el.getAttribute('data-testid'),
        dataQa: el.getAttribute('data-qa'),
        label: el.closest('label')?.textContent?.trim() ||
               document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim(),
        classes: el.className,
    });
});
```

Save this output as `docs/ats-fields/<ats-name>.json` — this is your **ground truth reference**.

---

## Phase 2: Build the Handler

### Step 5 — Create the handler file

Create `src/content/ats/<ats-name>.ts` following this template:

```typescript
import type { ATSHandler, DetectedField, MappedField, FillDetail } from '@/shared/types';
import { detectFormFields } from '../detector';
import { fillSingleField } from '../filler';
import { log } from '@/shared/logger';

// ── Detection ──
// Use ONLY real URLs you've seen — no invented patterns
function isAtsName(): boolean {
    const url = window.location.href.toLowerCase();
    return url.includes('<domain-from-real-page>');
}

// ── Field Detection ──
// Map fields using ONLY the exact attributes you found in Step 4
function detectAtsNameFields(): DetectedField[] {
    const fields = detectFormFields();

    for (const field of fields) {
        // Use exact attribute checks from your field dump
        // Example: if (field.name === 'candidate_first_name') { ... }
    }

    return fields;
}

// ── Fill Logic ──
// Only add custom logic if this ATS requires special handling
// (e.g., typeaheads, custom dropdowns, multi-step forms)
async function fillAtsNameField(field: MappedField): Promise<FillDetail> {
    // Default: use the generic filler
    return fillSingleField(field);
}

// ── Dropdown Handling ──
async function handleAtsNameDropdown(element: HTMLElement, value: string): Promise<boolean> {
    if (element.tagName.toLowerCase() === 'select') {
        const select = element as HTMLSelectElement;
        for (const option of select.options) {
            if (option.text.toLowerCase().includes(value.toLowerCase())) {
                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
        }
    }
    return false;
}

// ── File Upload ──
async function handleAtsNameFileUpload(_element: HTMLElement, _file: File): Promise<boolean> {
    return false; // Use default upload logic
}

// ── Export ──
export const atsNameHandler: ATSHandler = {
    name: '<ATS Display Name>',
    detect: isAtsName,
    detectFields: detectAtsNameFields,
    fillField: fillAtsNameField,
    handleDropdown: handleAtsNameDropdown,
    handleFileUpload: handleAtsNameFileUpload,
};
```

### Step 6 — Add deterministic patterns

If this ATS uses unique `data-*` attributes or `name` attributes, add them to `src/content/profiles/core.ts`:

- `dataAutomationMap` — for `data-automation-id` or `data-testid` attributes
- `exactNameMap` — for exact `name=""` attribute matches
- `fieldMap` — for regex patterns matching `id + name + label + placeholder`

**Only add patterns you found in the real field dump from Step 4.**

### Step 7 — Register the handler

In `src/content/ats/index.ts`:

1. Import the handler
2. Add it to the `handlers[]` array (before `genericHandler`, which is always last)

---

## Phase 3: Write Tests

### Step 8 — Add fixture-based tests

In `tests/deterministic-matcher.test.ts`, add a new describe block:

```typescript
describe('Deterministic Matcher — <ATS Name>', () => {
    let result: MatchResult;

    beforeAll(() => {
        document.body.innerHTML = readFixture('<ats-name>.html');
        const fields = scanFormFields(document);
        result = deterministicMatch(fields, MOCK_PROFILE);
    });

    it('should match First Name', () => {
        expect(result.matched.find(m => m.profileKey === 'firstName')).toBeDefined();
    });

    // Add one test per field from your Step 4 dump
});
```

### Step 9 — Run tests

```bash
npm test
```

All tests must pass. If a field doesn't match, check:
1. Is the pattern in `core.ts`?
2. Does the fixture HTML have the exact attribute you expected?
3. Is a more specific pattern eating the match first?

### Step 10 — Run TypeScript check

```bash
npx tsc --noEmit
```

---

## Phase 4: Verify on Real Page

### Step 11 — Build and load extension

```bash
npm run build
```

Load `dist/` as an unpacked extension in Chrome.

### Step 12 — Test on the real ATS page

1. Navigate to the real job application URL
2. Click the FAB button
3. Check DevTools console for `[PMHNP]` logs
4. Verify each field fills correctly
5. **Screenshot the filled form** as evidence

### Step 13 — Handle edge cases

Common ATS-specific quirks to look for:
- **Typeaheads** (location, school) — need `fillTypeahead()` with correct selectors
- **Custom dropdowns** (not native `<select>`) — need click + option selection
- **Multi-step forms** — test page navigation
- **Drag-drop uploads** — test file attachment
- **Dynamic fields** (loaded via AJAX) — may need `MutationObserver` or delays

---

## Checklist

- [ ] Real HTML fixture saved in `tests/fixtures/<ats>.html`
- [ ] Field dump saved as reference
- [ ] Handler file created in `src/content/ats/<ats>.ts`
- [ ] Handler registered in `src/content/ats/index.ts`
- [ ] Deterministic patterns added (if unique attributes exist)
- [ ] Test suite added with one assertion per field
- [ ] All tests pass (`npm test`)
- [ ] TypeScript clean (`npx tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] Tested on real ATS page with extension loaded
