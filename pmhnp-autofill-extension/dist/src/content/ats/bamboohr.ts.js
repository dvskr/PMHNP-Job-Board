import { detectFormFields } from "/src/content/detector.ts.js";
import { fillSingleField } from "/src/content/filler.ts.js";
function isBambooHR() {
  const url = window.location.href.toLowerCase();
  return url.includes("bamboohr.com/careers") || url.includes("bamboohr.com/jobs");
}
function detectBambooHRFields() {
  return detectFormFields();
}
async function fillBambooHRField(field) {
  return fillSingleField(field);
}
async function handleBambooHRDropdown(element, value) {
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
  return false;
}
async function handleBambooHRFileUpload(_element, _file) {
  return false;
}
export const bamboohrHandler = {
  name: "BambooHR",
  detect: isBambooHR,
  detectFields: detectBambooHRFields,
  fillField: fillBambooHRField,
  handleDropdown: handleBambooHRDropdown,
  handleFileUpload: handleBambooHRFileUpload
};
