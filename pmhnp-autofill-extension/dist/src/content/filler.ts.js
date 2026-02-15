import { getSettings } from "/src/shared/storage.ts.js";
import { FILL_DELAYS } from "/src/shared/constants.ts.js";
export async function fillForm(mappedFields) {
  const settings = await getSettings();
  const delay = FILL_DELAYS[settings.fillSpeed] || 50;
  const result = {
    total: mappedFields.length,
    filled: 0,
    skipped: 0,
    failed: 0,
    needsAI: 0,
    needsFile: 0,
    details: []
  };
  const sorted = [...mappedFields].sort((a, b) => {
    const order = { text: 0, date: 1, select: 2, radio: 3, checkbox: 4, file: 5, ai_generate: 6 };
    return (order[a.fillMethod] ?? 9) - (order[b.fillMethod] ?? 9);
  });
  for (const mapped of sorted) {
    if (mapped.requiresAI) {
      result.needsAI++;
      result.details.push({ field: mapped, status: "needs_review" });
      console.log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → needs AI`);
      continue;
    }
    if (mapped.requiresFile) {
      result.needsFile++;
      result.details.push({ field: mapped, status: "needs_review" });
      console.log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → needs file upload`);
      continue;
    }
    if (mapped.status === "no_data") {
      result.skipped++;
      result.details.push({ field: mapped, status: "skipped", error: "No profile data" });
      console.log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → no profile data`);
      continue;
    }
    if (mapped.status === "ambiguous") {
      result.skipped++;
      result.details.push({ field: mapped, status: "skipped", error: "Ambiguous match" });
      console.log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → ambiguous match`);
      continue;
    }
    if (!settings.overwriteExistingValues && mapped.field.currentValue) {
      result.skipped++;
      result.details.push({ field: mapped, status: "skipped", error: "Already has value" });
      console.log(`[PMHNP]   ⏭️ "${mapped.field.identifier}" → already has value: "${String(mapped.field.currentValue).substring(0, 20)}"`);
      continue;
    }
    try {
      console.log(`[PMHNP] Filling field "${mapped.field.identifier}" (${mapped.fillMethod}) with value: "${String(mapped.value).substring(0, 30)}"`);
      const detail = await fillSingleField(mapped);
      result.details.push(detail);
      if (detail.status === "filled") {
        result.filled++;
        console.log(`[PMHNP]   ✅ Filled "${mapped.field.identifier}"`);
      } else if (detail.status === "failed") {
        result.failed++;
        console.log(`[PMHNP]   ❌ Failed "${mapped.field.identifier}": ${detail.error}`);
      } else {
        result.skipped++;
        console.log(`[PMHNP]   ⏭️ Skipped "${mapped.field.identifier}": ${detail.error || detail.status}`);
      }
    } catch (err) {
      result.failed++;
      console.log(`[PMHNP]   ❌ Exception filling "${mapped.field.identifier}": ${err instanceof Error ? err.message : err}`);
      result.details.push({
        field: mapped,
        status: "failed",
        error: err instanceof Error ? err.message : "Unknown error"
      });
    }
    await sleep(delay);
  }
  return result;
}
export async function fillSingleField(mapped) {
  const { field, value, fillMethod } = mapped;
  const el = field.element;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(50);
  try {
    switch (fillMethod) {
      case "text":
      case "date":
        await fillTextInput(el, String(value));
        break;
      case "select":
        await fillSelect(el, String(value));
        break;
      case "radio":
        await fillRadio(el, value);
        break;
      case "checkbox":
        await fillCheckbox(el, value);
        break;
      default:
        return { field: mapped, status: "skipped", error: `Unsupported fill method: ${fillMethod}` };
    }
    await sleep(200);
    const verified = verifyFill(el, value);
    if (!verified) {
      console.log(`[PMHNP]   Verification failed for "${field.identifier}", trying character-by-character typing...`);
      try {
        await simulateTyping(el, String(value));
        await sleep(200);
        const retryVerified = verifyFill(el, value);
        if (!retryVerified) {
          console.log(`[PMHNP]   Retry verification also failed — marking as needs_review`);
          return { field: mapped, status: "filled", error: "Value set but verification uncertain" };
        }
      } catch (retryErr) {
        console.log(`[PMHNP]   simulateTyping error: ${retryErr instanceof Error ? retryErr.message : retryErr}`);
        return { field: mapped, status: "filled", error: "Fill attempted, verification skipped" };
      }
    }
    return { field: mapped, status: "filled" };
  } catch (err) {
    return {
      field: mapped,
      status: "failed",
      error: err instanceof Error ? err.message : "Fill failed"
    };
  }
}
async function fillTextInput(el, value) {
  const input = el;
  input.focus();
  input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  await sleep(50);
  input.value = "";
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "", inputType: "deleteContentBackward" }));
  await sleep(30);
  try {
    input.select();
    const cmdResult = document.execCommand("insertText", false, value);
    if (cmdResult) {
      console.log(`[PMHNP] execCommand insertText succeeded for "${value.substring(0, 20)}..."`);
      await sleep(50);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      return;
    }
  } catch {
  }
  triggerReactChange(el, value);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(30);
  input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}
export function triggerReactChange(element, value) {
  const tag = element.tagName.toLowerCase();
  try {
    let descriptor;
    if (tag === "textarea") {
      descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    } else if (tag === "input") {
      descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    } else if (tag === "select") {
      descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value");
    }
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  } catch {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
async function fillSelect(el, value) {
  if (el.tagName.toLowerCase() === "select") {
    const select = el;
    const options = Array.from(select.options);
    const match = options.find(
      (o) => o.value.toLowerCase() === value.toLowerCase() || o.text.toLowerCase().trim() === value.toLowerCase() || o.text.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(o.text.toLowerCase().trim())
    );
    if (match) {
      select.value = match.value;
      triggerReactChange(el, match.value);
    }
  } else {
    await fillCustomDropdown(el, value);
  }
}
async function fillCustomDropdown(el, value) {
  el.click();
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  await sleep(300);
  const optionSelectors = [
    '[role="option"]',
    '[data-automation-id*="promptOption"]',
    'li[role="presentation"]',
    ".dropdown-option",
    '[class*="option"]',
    "li"
  ];
  for (const selector of optionSelectors) {
    const options = document.querySelectorAll(selector);
    for (const opt of options) {
      const text = opt.textContent?.trim().toLowerCase() || "";
      if (text === value.toLowerCase() || text.includes(value.toLowerCase())) {
        opt.click();
        await sleep(100);
        return;
      }
    }
  }
}
async function fillRadio(el, value) {
  const name = el.name;
  if (!name) return;
  const radios = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`);
  const targetValue = typeof value === "boolean" ? value ? "yes" : "no" : String(value).toLowerCase();
  for (const radio of radios) {
    const radioValue = radio.value.toLowerCase();
    const radioLabel = findRadioLabel(radio).toLowerCase();
    if (radioValue === targetValue || radioLabel === targetValue || radioLabel.includes(targetValue) || targetValue === "yes" && (radioValue === "true" || radioValue === "1" || radioLabel === "yes") || targetValue === "no" && (radioValue === "false" || radioValue === "0" || radioLabel === "no")) {
      radio.checked = true;
      radio.click();
      radio.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
  }
}
function findRadioLabel(radio) {
  if (radio.id) {
    const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`);
    if (label) return label.textContent?.trim() || "";
  }
  const parentLabel = radio.closest("label");
  if (parentLabel) return parentLabel.textContent?.trim() || "";
  const next = radio.nextSibling;
  if (next && next.nodeType === Node.TEXT_NODE) return next.textContent?.trim() || "";
  return radio.value;
}
async function fillCheckbox(el, value) {
  const checkbox = el;
  const shouldBeChecked = typeof value === "boolean" ? value : value === "true" || value === "yes" || value === "1";
  if (checkbox.checked !== shouldBeChecked) {
    checkbox.click();
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
export async function simulateTyping(element, value) {
  const input = element;
  input.focus();
  input.value = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    input.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
    input.value += char;
    input.dispatchEvent(new InputEvent("input", { data: char, inputType: "insertText", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
    await sleep(10);
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}
function verifyFill(el, value) {
  const input = el;
  if (el.tagName.toLowerCase() === "input" && el.type === "checkbox") {
    const expected = typeof value === "boolean" ? value : value === "true";
    return el.checked === expected;
  }
  if (el.tagName.toLowerCase() === "input" && el.type === "radio") {
    return el.checked;
  }
  const currentVal = input.value?.toLowerCase().trim() || "";
  const expectedVal = String(value).toLowerCase().trim();
  return currentVal === expectedVal || currentVal.length > 0 && currentVal.includes(expectedVal.substring(0, 5));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
