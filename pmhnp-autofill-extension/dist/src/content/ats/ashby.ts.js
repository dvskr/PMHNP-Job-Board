import { detectFormFields } from "/src/content/detector.ts.js";
import { fillSingleField, triggerReactChange } from "/src/content/filler.ts.js";
function isAshby() {
  return window.location.href.toLowerCase().includes("ashbyhq.com");
}
function detectAshbyFields() {
  return detectFormFields();
}
async function fillAshbyField(field) {
  triggerReactChange(field.field.element, String(field.value));
  return fillSingleField(field);
}
async function handleAshbyDropdown(element, value) {
  element.click();
  await new Promise((r) => setTimeout(r, 300));
  const options = document.querySelectorAll('[role="option"]');
  for (const opt of options) {
    if (opt.textContent?.toLowerCase().includes(value.toLowerCase())) {
      opt.click();
      return true;
    }
  }
  return false;
}
async function handleAshbyFileUpload(_element, _file) {
  return false;
}
export const ashbyHandler = {
  name: "Ashby",
  detect: isAshby,
  detectFields: detectAshbyFields,
  fillField: fillAshbyField,
  handleDropdown: handleAshbyDropdown,
  handleFileUpload: handleAshbyFileUpload
};
