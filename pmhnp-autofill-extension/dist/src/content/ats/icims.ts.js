import { detectFormFields } from "/src/content/detector.ts.js";
import { fillSingleField } from "/src/content/filler.ts.js";
function isICIMS() {
  const url = window.location.href.toLowerCase();
  if (url.includes("icims.com")) return true;
  return !!document.querySelector('[class*="iCIMS"]');
}
function detectICIMSFields() {
  const fields = detectFormFields();
  try {
    const iframes = document.querySelectorAll("iframe");
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          const iframeElements = doc.querySelectorAll("input, select, textarea");
          if (iframeElements.length > 0) {
            for (const field of fields) {
              if (iframe.contentDocument?.contains(field.element)) {
                field.atsSpecific = true;
              }
            }
          }
        }
      } catch {
      }
    }
  } catch {
  }
  return fields;
}
async function fillICIMSField(field) {
  return fillSingleField(field);
}
async function handleICIMSDropdown(element, value) {
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
async function handleICIMSFileUpload(_element, _file) {
  return false;
}
export const icimsHandler = {
  name: "iCIMS",
  detect: isICIMS,
  detectFields: detectICIMSFields,
  fillField: fillICIMSField,
  handleDropdown: handleICIMSDropdown,
  handleFileUpload: handleICIMSFileUpload
};
