import { detectFormFields } from "/src/content/detector.ts.js";
import { fillSingleField } from "/src/content/filler.ts.js";
function isLever() {
  const url = window.location.href.toLowerCase();
  return url.includes("jobs.lever.co") || url.includes("lever.co/apply");
}
function detectLeverFields() {
  const fields = detectFormFields();
  for (const field of fields) {
    const name = field.name.toLowerCase();
    if (name === "name") {
      field.identifier = "full_name";
      field.confidence = 0.95;
      field.atsSpecific = true;
    } else if (name === "email") {
      field.identifier = "email";
      field.confidence = 0.95;
      field.atsSpecific = true;
    } else if (name === "phone") {
      field.identifier = "phone";
      field.confidence = 0.95;
      field.atsSpecific = true;
    } else if (name === "org") {
      field.identifier = "employer";
      field.confidence = 0.9;
      field.atsSpecific = true;
    } else if (name.includes("urls[linkedin]")) {
      field.identifier = "linkedin";
      field.confidence = 0.95;
      field.atsSpecific = true;
    } else if (name === "comments") {
      field.identifier = "open_ended_question";
      field.fieldCategory = "open_ended";
      field.confidence = 0.8;
      field.atsSpecific = true;
    } else if (name === "resume") {
      field.identifier = "resume_upload";
      field.fieldCategory = "document";
      field.confidence = 0.95;
      field.atsSpecific = true;
    }
  }
  return fields;
}
async function fillLeverField(field) {
  return fillSingleField(field);
}
async function handleLeverDropdown(element, value) {
  if (element.tagName.toLowerCase() === "select") {
    const select = element;
    for (const option of select.options) {
      if (option.text.toLowerCase().includes(value.toLowerCase())) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
  }
  return false;
}
async function handleLeverFileUpload(_element, _file) {
  return false;
}
export const leverHandler = {
  name: "Lever",
  detect: isLever,
  detectFields: detectLeverFields,
  fillField: fillLeverField,
  handleDropdown: handleLeverDropdown,
  handleFileUpload: handleLeverFileUpload
};
