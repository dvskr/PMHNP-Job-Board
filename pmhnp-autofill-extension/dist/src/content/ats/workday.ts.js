import { detectFormFields } from "/src/content/detector.ts.js";
import { fillSingleField } from "/src/content/filler.ts.js";
const WORKDAY_FIELD_MAP = {
  "legalNameSection_firstName": { identifier: "first_name", category: "personal" },
  "legalNameSection_lastName": { identifier: "last_name", category: "personal" },
  "addressSection_addressLine1": { identifier: "address_line1", category: "personal" },
  "addressSection_city": { identifier: "city", category: "personal" },
  "addressSection_countryRegion": { identifier: "state", category: "personal" },
  "addressSection_postalCode": { identifier: "zip", category: "personal" },
  "phone-number": { identifier: "phone", category: "personal" },
  "email": { identifier: "email", category: "personal" }
};
function isWorkday() {
  const url = window.location.href.toLowerCase();
  if (url.includes("myworkdayjobs.com") || url.includes("wd5.myworkday.com") || url.includes("workday.com")) {
    return true;
  }
  return !!document.querySelector("[data-automation-id]");
}
function detectWorkdayFields() {
  const genericFields = detectFormFields();
  const allElements = document.querySelectorAll("[data-automation-id]");
  for (const el of allElements) {
    const automationId = el.getAttribute("data-automation-id") || "";
    const mapping = Object.entries(WORKDAY_FIELD_MAP).find(([key]) => automationId.includes(key));
    if (mapping) {
      const existing = genericFields.find((f) => f.element === el);
      if (existing) {
        existing.identifier = mapping[1].identifier;
        existing.confidence = 0.95;
        existing.atsSpecific = true;
      }
    }
  }
  return genericFields;
}
async function fillWorkdayField(field) {
  return fillSingleField(field);
}
async function handleWorkdayDropdown(element, value) {
  element.click();
  await new Promise((r) => setTimeout(r, 400));
  const options = document.querySelectorAll('[data-automation-id*="promptOption"], [role="option"]');
  for (const opt of options) {
    const text = opt.textContent?.trim().toLowerCase() || "";
    if (text === value.toLowerCase() || text.includes(value.toLowerCase())) {
      opt.click();
      await new Promise((r) => setTimeout(r, 200));
      return true;
    }
  }
  return false;
}
async function handleWorkdayFileUpload(_element, _file) {
  return false;
}
function handleWorkdayMultiStep() {
  const steps = document.querySelectorAll('[data-automation-id*="progressBarStep"], [class*="step"]');
  const active = document.querySelector('[data-automation-id*="progressBarStep"][aria-current="step"], [class*="active"]');
  const currentStep = active ? Array.from(steps).indexOf(active) + 1 : 1;
  return { currentStep, totalSteps: steps.length || 1 };
}
export const workdayHandler = {
  name: "Workday",
  detect: isWorkday,
  detectFields: detectWorkdayFields,
  fillField: fillWorkdayField,
  handleDropdown: handleWorkdayDropdown,
  handleFileUpload: handleWorkdayFileUpload,
  handleMultiStep: handleWorkdayMultiStep
};
