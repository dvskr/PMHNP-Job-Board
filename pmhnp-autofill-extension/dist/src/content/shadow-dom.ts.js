export function querySelectorAllDeep(selector, root = document) {
  const results = [];
  const directMatches = (root instanceof Element ? root : root).querySelectorAll(selector);
  results.push(...Array.from(directMatches));
  const allElements = (root instanceof Element ? root : root).querySelectorAll("*");
  for (const el of allElements) {
    if (el.shadowRoot) {
      results.push(...querySelectorAllDeep(selector, el.shadowRoot));
    }
  }
  return results;
}
export function querySelectorDeep(selector, root = document) {
  const directMatch = (root instanceof Element ? root : root).querySelector(selector);
  if (directMatch) return directMatch;
  const allElements = (root instanceof Element ? root : root).querySelectorAll("*");
  for (const el of allElements) {
    if (el.shadowRoot) {
      const shadowMatch = querySelectorDeep(selector, el.shadowRoot);
      if (shadowMatch) return shadowMatch;
    }
  }
  return null;
}
export function findElementsByText(tagName, textFilter, root = document) {
  const results = [];
  const elements = (root instanceof Element ? root : root).querySelectorAll(tagName);
  for (const el of elements) {
    const text = el.textContent?.trim() || "";
    if (textFilter(text)) {
      results.push(el);
    }
  }
  const allElements = (root instanceof Element ? root : root).querySelectorAll("*");
  for (const el of allElements) {
    if (el.shadowRoot) {
      results.push(...findElementsByText(tagName, textFilter, el.shadowRoot));
    }
  }
  return results;
}
export function getVisibleText(root = document) {
  const texts = [];
  const walker = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) texts.push(text);
    }
    if (node instanceof HTMLElement && node.shadowRoot) {
      walker(node.shadowRoot);
    }
    for (const child of node.childNodes) {
      walker(child);
    }
  };
  walker(root instanceof Document ? root.body : root);
  return texts.join(" ");
}
