import { detectATS, isApplicationPage } from "/src/content/detector.ts.js";
import { mapFieldsToProfile } from "/src/content/matcher.ts.js";
import { fillForm } from "/src/content/filler.ts.js";
import { getActiveHandler } from "/src/content/ats/index.ts.js";
import { captureError } from "/src/shared/errorHandler.ts.js";
let cachedProfile = null;
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleContentMessage(message).then(sendResponse).catch((err) => {
    captureError(err, `content:${message.type}`);
    sendResponse({ error: err instanceof Error ? err.message : "Unknown error" });
  });
  return true;
});
async function handleContentMessage(message) {
  switch (message.type) {
    case "IS_APPLICATION_PAGE": {
      console.log(`[PMHNP] === IS_APPLICATION_PAGE check in frame: ${window.location.href} ===`);
      console.log(`[PMHNP] document.readyState: ${document.readyState}`);
      console.log(`[PMHNP] Total DOM elements: ${document.querySelectorAll("*").length}`);
      const allEls = document.querySelectorAll("*");
      let shadowCount = 0;
      for (const el of allEls) {
        if (el.shadowRoot) shadowCount++;
      }
      console.log(`[PMHNP] Elements with shadowRoot: ${shadowCount}`);
      const ats = detectATS();
      console.log("[PMHNP] ATS detection result:", ats);
      const handler = getActiveHandler();
      const fields = handler.detectFields();
      console.log(`[PMHNP] Detected ${fields.length} fields:`, fields.map((f) => ({
        id: f.identifier,
        label: f.label,
        type: f.fieldType,
        confidence: f.confidence,
        category: f.fieldCategory
      })));
      const isApp = isApplicationPage();
      console.log(`[PMHNP] isApplicationPage: ${isApp}`);
      const allInputs = document.querySelectorAll("input, select, textarea");
      console.log(`[PMHNP] Total raw input/select/textarea: ${allInputs.length}`);
      if (allInputs.length > 0) {
        console.log(`[PMHNP] Inputs:`, Array.from(allInputs).map((el) => ({
          tag: el.tagName,
          type: el.type,
          name: el.name,
          id: el.id,
          visible: el.getBoundingClientRect().width > 0
        })));
      }
      const iframes = document.querySelectorAll("iframe");
      console.log(`[PMHNP] Iframes in this frame: ${iframes.length}`);
      for (const iframe of iframes) {
        console.log(`[PMHNP]   iframe src="${iframe.src}", accessible=${(() => {
          try {
            return !!iframe.contentDocument;
          } catch {
            return false;
          }
        })()}`);
      }
      const info = {
        isApplication: isApp,
        atsName: ats?.name || null,
        fieldCount: fields.length
      };
      return info;
    }
    case "START_AUTOFILL": {
      return performAutofill();
    }
    case "PROFILE_UPDATED": {
      cachedProfile = null;
      return { success: true };
    }
    default:
      return {};
  }
}
async function performAutofill() {
  console.log("[PMHNP] Starting autofill...");
  if (!cachedProfile) {
    const response = await chrome.runtime.sendMessage({ type: "GET_PROFILE" });
    if (response?.error) throw new Error(response.error);
    cachedProfile = response;
  }
  const handler = getActiveHandler();
  console.log(`[PMHNP] Using handler: ${handler.name}`);
  const fields = handler.detectFields();
  console.log(`[PMHNP] Detected ${fields.length} form fields`);
  if (fields.length === 0) {
    throw new Error("No form fields detected on this page");
  }
  const mapped = mapFieldsToProfile(fields, cachedProfile);
  console.log(`[PMHNP] Mapped ${mapped.length} fields to profile data`);
  console.log("[PMHNP] === Mapped Fields Summary ===");
  for (const m of mapped) {
    console.log(`[PMHNP]   ${m.field.identifier} → value="${String(m.value).substring(0, 30)}" status=${m.status} method=${m.fillMethod} ai=${m.requiresAI} file=${m.requiresFile}`);
  }
  const result = await fillForm(mapped);
  console.log(`[PMHNP] Fill complete: ${result.filled}/${result.total} fields filled`);
  if (handler.name === "SmartRecruiters" && cachedProfile) {
    try {
      const { runFullSmartRecruitersFlow } = await import("/src/content/ats/smartrecruiters.ts.js");
      await runFullSmartRecruitersFlow(cachedProfile);
    } catch (err) {
      console.log("[PMHNP] SmartRecruiters full flow error:", err);
    }
  }
  return result;
}
console.log("[PMHNP] Content script loaded");
