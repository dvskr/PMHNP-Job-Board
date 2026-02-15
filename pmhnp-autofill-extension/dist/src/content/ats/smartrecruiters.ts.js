import { detectFormFields } from "/src/content/detector.ts.js";
import { fillSingleField, triggerReactChange } from "/src/content/filler.ts.js";
function isSmartRecruiters() {
  return window.location.href.toLowerCase().includes("jobs.smartrecruiters.com");
}
function detectSmartRecruitersFields() {
  return detectFormFields();
}
async function fillSmartRecruitersField(field) {
  return fillSingleField(field);
}
async function handleSmartRecruitersDropdown(el, value) {
  el.click();
  await sleep(400);
  const options = deepQueryAll('[role="option"], [role="listbox"] li');
  for (const opt of options) {
    if ((opt.textContent?.trim().toLowerCase() || "").includes(value.toLowerCase())) {
      opt.click();
      return true;
    }
  }
  return false;
}
async function handleSmartRecruitersFileUpload(_el, file) {
  const inputs = deepQueryAll('input[type="file"]');
  if (inputs.length > 0) {
    const dt = new DataTransfer();
    dt.items.add(file);
    inputs[0].files = dt.files;
    inputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}
function deepQueryAll(selector, root = document) {
  const results = [];
  results.push(...Array.from(root.querySelectorAll(selector)));
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) results.push(...deepQueryAll(selector, el.shadowRoot));
  }
  return results;
}
function findAllVisibleByText(text) {
  const results = [];
  const lower = text.toLowerCase();
  function walk(root) {
    for (const el of root.querySelectorAll("*")) {
      const h = el;
      if (h.shadowRoot) walk(h.shadowRoot);
      let direct = "";
      for (const c of h.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) direct += c.textContent || "";
      }
      if (direct.trim().toLowerCase().includes(lower)) {
        const r = h.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) results.push(h);
      }
    }
  }
  walk(document);
  return results;
}
function getVisibleFormFields() {
  return deepQueryAll(
    'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea, select'
  ).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 30 && r.height > 10 && window.getComputedStyle(el).display !== "none";
  });
}
export async function runFullSmartRecruitersFlow(profile) {
  console.log("[PMHNP] === SmartRecruiters Full Flow ===");
  await handleSection("experience", profile);
  await sleep(800);
  await handleSection("education", profile);
  await sleep(500);
  await fillMessageTextarea(profile);
  await tryUploadResume(profile);
  console.log("[PMHNP] === Flow Complete ===");
}
async function handleSection(name, profile) {
  console.log(`[PMHNP] --- ${name} ---`);
  const fieldsBefore = new Set(getVisibleFormFields());
  console.log(`[PMHNP] Fields before Add: ${fieldsBefore.size}`);
  const heading = findHeading(name);
  if (!heading) {
    console.log(`[PMHNP] ❌ No "${name}" heading`);
    return;
  }
  const hY = heading.getBoundingClientRect().top;
  const addEls = findAllVisibleByText("Add");
  let btn = null;
  let best = 200;
  for (const el of addEls) {
    if ((el.textContent?.trim() || "").length > 20) continue;
    const d = Math.abs(el.getBoundingClientRect().top - hY);
    if (d < best) {
      best = d;
      btn = el;
    }
  }
  if (!btn) {
    const w = document.documentElement.clientWidth;
    for (const xoff of [-60, -80, -100]) {
      const el = document.elementFromPoint(w + xoff, hY + 15);
      if (el && (el.textContent?.trim().toLowerCase().includes("add") || el.parentElement?.textContent?.trim().toLowerCase().includes("add"))) {
        btn = el.textContent?.trim().toLowerCase().includes("add") ? el : el.parentElement;
        break;
      }
    }
  }
  if (!btn) {
    console.log(`[PMHNP] ❌ No Add button for "${name}"`);
    return;
  }
  console.log(`[PMHNP] ✅ Clicking Add: "${btn.textContent?.trim()}"`);
  btn.click();
  await sleep(1500);
  const fieldsAfter = getVisibleFormFields();
  const newFields = fieldsAfter.filter((f) => !fieldsBefore.has(f));
  console.log(`[PMHNP] Fields after Add: ${fieldsAfter.length}, NEW fields: ${newFields.length}`);
  const sorted = [...newFields].sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const yDiff = ra.top - rb.top;
    if (Math.abs(yDiff) > 20) return yDiff;
    return ra.left - rb.left;
  });
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    const r = f.getBoundingClientRect();
    const tag = f.tagName.toLowerCase();
    const type = f.type || "";
    const ph = f.placeholder || "";
    console.log(`[PMHNP]   NEW [${i}] <${tag} type="${type}"> pos=(${Math.round(r.left)},${Math.round(r.top)}) ph="${ph}"`);
  }
  const rows = groupByRow(sorted);
  console.log(`[PMHNP] Grouped into ${rows.length} rows`);
  if (name === "experience") await fillExpFields(rows, profile);
  else await fillEduFields(rows, profile);
}
function findHeading(name) {
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const els = findAllVisibleByText(cap);
  for (const el of els) {
    if (["H1", "H2", "H3", "H4", "H5", "H6"].includes(el.tagName)) return el;
  }
  for (const el of els) {
    const t = el.textContent?.trim().toLowerCase() || "";
    if (t === name) return el;
  }
  return els[0] || null;
}
function groupByRow(fields) {
  if (fields.length === 0) return [];
  const rows = [[fields[0]]];
  for (let i = 1; i < fields.length; i++) {
    const prevY = fields[i - 1].getBoundingClientRect().top;
    const curY = fields[i].getBoundingClientRect().top;
    if (Math.abs(curY - prevY) > 20) {
      rows.push([fields[i]]);
    } else {
      rows[rows.length - 1].push(fields[i]);
    }
  }
  return rows;
}
async function fillExpFields(rows, profile) {
  const work = profile?.workExperience?.[0];
  if (!work) {
    console.log("[PMHNP] No work experience data");
    return;
  }
  const fieldDefs = [
    { row: 0, col: 0, value: work.jobTitle || "", autocomplete: true, date: false },
    // Title
    { row: 0, col: 1, value: work.employerName || "", autocomplete: true, date: false },
    // Company
    { row: 1, col: 0, value: work.location || "", autocomplete: true, date: false },
    // Office location
    { row: 2, col: 0, value: work.description || "", autocomplete: false, date: false },
    // Description
    { row: 3, col: 0, value: work.startDate || "", autocomplete: false, date: true },
    // From
    { row: 3, col: 1, value: work.isCurrent ? "" : work.endDate || "", autocomplete: false, date: true }
    // To
  ];
  for (const def of fieldDefs) {
    if (!def.value) {
      console.log(`[PMHNP] Skip row${def.row} col${def.col} (no value)`);
      continue;
    }
    if (def.row >= rows.length) {
      console.log(`[PMHNP] Skip row${def.row} (only ${rows.length} rows)`);
      continue;
    }
    if (def.col >= rows[def.row].length) {
      console.log(`[PMHNP] Skip row${def.row} col${def.col} (only ${rows[def.row].length} cols)`);
      continue;
    }
    const field = rows[def.row][def.col];
    console.log(`[PMHNP] Exp row${def.row} col${def.col}: "${def.value.substring(0, 30)}" (ac=${def.autocomplete} date=${def.date})`);
    if (def.date) await fillDate(field, def.value);
    else if (def.autocomplete) await fillAutocomplete(field, def.value);
    else await smartFill(field, def.value);
  }
  if (work.isCurrent) await clickCheckboxByText("currently work");
  await sleep(300);
  await clickButtonByText("Save");
}
async function fillEduFields(rows, profile) {
  const edu = profile?.education?.[0];
  if (!edu) {
    console.log("[PMHNP] No education data");
    return;
  }
  const fieldDefs = [
    { row: 0, col: 0, value: edu.schoolName || "", autocomplete: true, date: false },
    // Institution
    { row: 1, col: 0, value: edu.fieldOfStudy || "", autocomplete: false, date: false },
    // Major
    { row: 1, col: 1, value: edu.degreeType || "", autocomplete: false, date: false },
    // Degree
    { row: 2, col: 0, value: edu.location || "", autocomplete: true, date: false },
    // School location
    // Row 3: Description (skip)
    { row: 4, col: 0, value: edu.startDate || "", autocomplete: false, date: true },
    // From
    { row: 4, col: 1, value: edu.graduationDate || "", autocomplete: false, date: true }
    // To
  ];
  for (const def of fieldDefs) {
    if (!def.value) continue;
    if (def.row >= rows.length || def.col >= rows[def.row].length) {
      console.log(`[PMHNP] Skip edu row${def.row} col${def.col} (out of range, ${rows.length} rows)`);
      continue;
    }
    const field = rows[def.row][def.col];
    console.log(`[PMHNP] Edu row${def.row} col${def.col}: "${def.value.substring(0, 30)}" (ac=${def.autocomplete} date=${def.date})`);
    if (def.date) await fillDate(field, def.value);
    else if (def.autocomplete) await fillAutocomplete(field, def.value);
    else await smartFill(field, def.value);
  }
  if (edu.isCurrentlyAttending) await clickCheckboxByText("currently attend");
  await sleep(300);
  await clickButtonByText("Save");
}
async function fillAutocomplete(input, value) {
  console.log(`[PMHNP] Autocomplete: "${value.substring(0, 25)}"`);
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(200);
  input.focus();
  input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  await sleep(100);
  input.value = "";
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  await sleep(50);
  input.select();
  const typed = document.execCommand("insertText", false, value);
  if (typed) {
    console.log(`[PMHNP] execCommand typed "${value.substring(0, 20)}"`);
  } else {
    input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  }
  console.log("[PMHNP] Waiting for autocomplete...");
  await sleep(1200);
  const selectors = [
    '[role="option"]',
    '[role="listbox"] li',
    "mat-option",
    ".cdk-overlay-pane li",
    '.cdk-overlay-pane [role="option"]'
  ];
  const valueLower = value.toLowerCase();
  for (const sel of selectors) {
    const options = deepQueryAll(sel);
    const visible = options.filter((o) => {
      const r = o.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (visible.length > 0) {
      let bestMatch = null;
      for (const opt of visible) {
        const optText = (opt.textContent?.trim() || opt.getAttribute("aria-label") || opt.getAttribute("title") || "").toLowerCase();
        console.log(`[PMHNP]   Suggestion: "${optText}" (tag=${opt.tagName})`);
        if (optText && (optText.includes(valueLower) || valueLower.includes(optText))) {
          bestMatch = opt;
          break;
        }
      }
      if (bestMatch) {
        console.log(`[PMHNP] ✅ Clicking matching suggestion: "${bestMatch.textContent?.trim().substring(0, 40)}"`);
        bestMatch.click();
        await sleep(400);
        return;
      } else {
        console.log(`[PMHNP] ℹ️ ${visible.length} suggestions found, none match exactly. Clicking first.`);
        visible[0].click();
        await sleep(400);
        return;
      }
    }
  }
  console.log("[PMHNP] No suggestions found, tabbing out to accept typed value");
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", keyCode: 9, bubbles: true }));
  await sleep(100);
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}
async function fillDate(input, dateStr) {
  if (!dateStr) return;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    const fmt = `${yyyy}-${mm}-${dd}`;
    console.log(`[PMHNP] Date: "${fmt}" (from ${dateStr})`);
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(100);
    input.focus();
    input.click();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await sleep(200);
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(input, fmt);
      console.log(`[PMHNP] Date: native setter applied "${fmt}"`);
    } else {
      input.value = fmt;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: fmt, inputType: "insertText" }));
    await sleep(100);
    try {
      input.focus();
      input.select();
      document.execCommand("insertText", false, fmt);
    } catch {
    }
    await sleep(100);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(300);
    console.log(`[PMHNP] Date field value after fill: "${input.value}"`);
  } catch (e) {
    console.log(`[PMHNP] Date error: ${e}`);
  }
}
async function smartFill(el, value) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(100);
  el.focus();
  el.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  await sleep(50);
  el.value = "";
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  await sleep(30);
  try {
    el.select();
    if (document.execCommand("insertText", false, value)) {
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      return;
    }
  } catch {
  }
  triggerReactChange(el, value);
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}
async function fillMessageTextarea(profile) {
  const headings = findAllVisibleByText("Message");
  if (headings.length === 0) {
    console.log('[PMHNP] No "Message" heading found');
    return;
  }
  let msgHeading = null;
  let bestY = -Infinity;
  for (const h of headings) {
    const y = h.getBoundingClientRect().top;
    if (y > bestY) {
      bestY = y;
      msgHeading = h;
    }
  }
  if (!msgHeading) return;
  const headingY = msgHeading.getBoundingClientRect().top;
  console.log(`[PMHNP] Message heading at Y=${Math.round(headingY)}`);
  const textareas = deepQueryAll("textarea");
  let bestTa = null;
  let bestDist = 300;
  for (const ta of textareas) {
    const r = ta.getBoundingClientRect();
    if (r.width < 100) continue;
    const dist = r.top - headingY;
    if (dist > 0 && dist < bestDist) {
      bestDist = dist;
      bestTa = ta;
    }
  }
  if (!bestTa) {
    console.log("[PMHNP] No textarea found near Message heading");
    return;
  }
  const p = profile?.personal;
  const name = p ? `${p.firstName || ""} ${p.lastName || ""}`.trim() : "";
  const msg = `I am writing to express my strong interest in this position. As a Psychiatric-Mental Health Nurse Practitioner (PMHNP) with clinical experience, I am confident I can make a meaningful contribution to your team. I look forward to discussing how my skills and experience align with your needs.

Best regards,
${name}`;
  console.log("[PMHNP] Filling message textarea (overwriting existing content)");
  bestTa.value = "";
  bestTa.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  await sleep(50);
  await smartFill(bestTa, msg);
}
async function tryUploadResume(profile) {
  const fileInputs = deepQueryAll('input[type="file"]');
  console.log(`[PMHNP] File inputs found: ${fileInputs.length}`);
  const meta = profile?.meta;
  const docs = profile?.documents;
  const url = meta?.resumeUrl || docs?.resume?.url || docs?.resumeUrl;
  console.log(`[PMHNP] Resume URL: ${url || "(none)"}`);
  if (!url) {
    console.log("[PMHNP] No resume URL in profile — skipping upload");
    return;
  }
  if (fileInputs.length === 0) {
    console.log("[PMHNP] No file inputs found — skipping upload");
    return;
  }
  try {
    console.log(`[PMHNP] Fetching resume: ${url}`);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`[PMHNP] Resume fetch failed: HTTP ${resp.status} ${resp.statusText}`);
      console.log("[PMHNP] ⚠️ Resume URL returned an error — file may not exist. Please update your resume URL in profile settings.");
      return;
    }
    const blob = await resp.blob();
    console.log(`[PMHNP] Resume fetched: ${blob.size} bytes, type=${blob.type}`);
    if (blob.size < 1024) {
      console.error("[PMHNP] Resume file too small — likely not a valid file");
      return;
    }
    const name = docs?.resume?.fileName || meta?.resumeFileName || "resume.pdf";
    const file = new File([blob], name, { type: blob.type || "application/pdf" });
    const dt = new DataTransfer();
    dt.items.add(file);
    let attached = false;
    for (const fi of fileInputs) {
      try {
        fi.files = dt.files;
        fi.dispatchEvent(new Event("change", { bubbles: true }));
        fi.dispatchEvent(new Event("input", { bubbles: true }));
        console.log(`[PMHNP] Set files on input: ${fi.name || fi.id || "(unnamed)"}`);
        attached = true;
        break;
      } catch (e) {
        console.log(`[PMHNP] File input set failed: ${e}`);
      }
    }
    const dropzones = deepQueryAll('[class*="dropzone"], [class*="drop-zone"], [class*="upload"], [class*="file-upload"]');
    console.log(`[PMHNP] Dropzone containers found: ${dropzones.length}`);
    for (const dz of dropzones) {
      try {
        const dropDt = new DataTransfer();
        dropDt.items.add(file);
        const dragEnter = new DragEvent("dragenter", { bubbles: true, dataTransfer: dropDt });
        const dragOver = new DragEvent("dragover", { bubbles: true, dataTransfer: dropDt });
        const drop = new DragEvent("drop", { bubbles: true, dataTransfer: dropDt });
        dz.dispatchEvent(dragEnter);
        dz.dispatchEvent(dragOver);
        dz.dispatchEvent(drop);
        console.log(`[PMHNP] Dispatched drop events on: ${dz.className?.substring(0, 50)}`);
        attached = true;
        break;
      } catch (e) {
        console.log(`[PMHNP] Dropzone dispatch failed: ${e}`);
      }
    }
    if (attached) {
      console.log("[PMHNP] ✅ Resume attached");
    } else {
      console.log("[PMHNP] ⚠️ Could not attach resume to any input");
    }
  } catch (e) {
    console.error("[PMHNP] Resume error:", e);
  }
}
async function clickButtonByText(text) {
  const lower = text.toLowerCase();
  const buttons = deepQueryAll('button, [role="button"], input[type="submit"]');
  for (const btn of buttons) {
    const t = btn.textContent?.trim().toLowerCase() || "";
    const r = btn.getBoundingClientRect();
    if (r.width === 0) continue;
    if (t === lower || t.includes(lower)) {
      console.log(`[PMHNP] Clicking: "${btn.textContent?.trim()}"`);
      btn.click();
      await sleep(700);
      return true;
    }
  }
  const els = findAllVisibleByText(text);
  for (const el of els) {
    if ((el.textContent?.trim() || "").length < 20) {
      el.click();
      await sleep(700);
      return true;
    }
  }
  console.log(`[PMHNP] ❌ Button "${text}" not found`);
  return false;
}
async function clickCheckboxByText(text) {
  const labels = findAllVisibleByText(text);
  for (const label of labels) {
    const cb = label.querySelector('input[type="checkbox"]') || label.parentElement?.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked) {
      cb.click();
      cb.dispatchEvent(new Event("change", { bubbles: true }));
      console.log(`[PMHNP] ✅ Checked "${text}"`);
      return;
    }
  }
  const cbs = deepQueryAll('input[type="checkbox"]');
  for (const label of labels) {
    const lR = label.getBoundingClientRect();
    for (const cb of cbs) {
      if (Math.abs(cb.getBoundingClientRect().top - lR.top) < 30 && !cb.checked) {
        cb.click();
        cb.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`[PMHNP] ✅ Checked "${text}" (proximity)`);
        return;
      }
    }
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
export const smartrecruitersHandler = {
  name: "SmartRecruiters",
  detect: isSmartRecruiters,
  detectFields: detectSmartRecruitersFields,
  fillField: fillSmartRecruitersField,
  handleDropdown: handleSmartRecruitersDropdown,
  handleFileUpload: handleSmartRecruitersFileUpload
};
