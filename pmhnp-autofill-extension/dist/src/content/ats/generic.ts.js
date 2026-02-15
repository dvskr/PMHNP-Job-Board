import { detectFormFields } from "/src/content/detector.ts.js";
import { fillSingleField } from "/src/content/filler.ts.js";
function isGeneric() {
  return true;
}
function detectGenericFields() {
  return detectFormFields();
}
async function fillGenericField(field) {
  return fillSingleField(field);
}
async function handleGenericDropdown(element, value) {
  if (element.tagName.toLowerCase() === "select") {
    const select = element;
    for (const opt of select.options) {
      if (opt.text.toLowerCase().includes(value.toLowerCase())) {
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
  }
  element.click();
  await new Promise((r) => setTimeout(r, 300));
  const options = document.querySelectorAll('[role="option"], [class*="option"], li');
  for (const opt of options) {
    if (opt.textContent?.toLowerCase().includes(value.toLowerCase())) {
      opt.click();
      return true;
    }
  }
  return false;
}
async function handleGenericFileUpload(_element, _file) {
  return false;
}
export const genericHandler = {
  name: "Generic",
  detect: isGeneric,
  detectFields: detectGenericFields,
  fillField: fillGenericField,
  handleDropdown: handleGenericDropdown,
  handleFileUpload: handleGenericFileUpload
};
