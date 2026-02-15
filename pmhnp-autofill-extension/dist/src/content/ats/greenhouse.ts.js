import { detectFormFields } from "/src/content/detector.ts.js";
import { fillSingleField } from "/src/content/filler.ts.js";
const GREENHOUSE_ID_MAP = {
  first_name: "first_name",
  last_name: "last_name",
  email: "email",
  phone: "phone",
  location: "city"
};
function isGreenhouse() {
  const url = window.location.href.toLowerCase();
  if (url.includes("boards.greenhouse.io") || url.includes("job-boards.greenhouse.io")) return true;
  return !!document.getElementById("application_form") || !!document.querySelector(".application-form");
}
function detectGreenhouseFields() {
  const fields = detectFormFields();
  for (const field of fields) {
    const id = field.id.toLowerCase();
    for (const [ghId, identifier] of Object.entries(GREENHOUSE_ID_MAP)) {
      if (id === ghId || id.includes(ghId)) {
        field.identifier = identifier;
        field.confidence = 0.95;
        field.atsSpecific = true;
      }
    }
    if (id.includes("job_application_answers_attributes")) {
      field.atsSpecific = true;
      if (field.fieldType === "textarea") {
        field.identifier = "open_ended_question";
        field.fieldCategory = "open_ended";
      }
    }
  }
  return fields;
}
async function fillGreenhouseField(field) {
  return fillSingleField(field);
}
async function handleGreenhouseDropdown(element, value) {
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
  element.click();
  await new Promise((r) => setTimeout(r, 300));
  const searchInput = document.querySelector(".select2-search__field, .chosen-search-input");
  if (searchInput) {
    searchInput.value = value;
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const result = document.querySelector(".select2-results__option--highlighted, .active-result");
    if (result) {
      result.click();
      return true;
    }
  }
  return false;
}
async function handleGreenhouseFileUpload(_element, _file) {
  return false;
}
export const greenhouseHandler = {
  name: "Greenhouse",
  detect: isGreenhouse,
  detectFields: detectGreenhouseFields,
  fillField: fillGreenhouseField,
  handleDropdown: handleGreenhouseDropdown,
  handleFileUpload: handleGreenhouseFileUpload
};
