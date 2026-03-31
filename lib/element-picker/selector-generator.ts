import type { SiblingInfo } from "./types";

function isGeneratedClass(cls: string): boolean {
  return (
    /^[a-z]{1,3}-[\da-f]{4,}$/i.test(cls) ||
    /^css-/.test(cls) ||
    /^sc-/.test(cls) ||
    /^_/.test(cls) ||
    cls.length > 30
  );
}

function escapeSelector(str: string): string {
  try {
    return CSS.escape(str);
  } catch {
    return str.replace(/([^\w-])/g, "\\$1");
  }
}

export function generateCssSelector(el: Element): string {
  // If element has a unique ID
  if (el.id) {
    const escaped = `#${escapeSelector(el.id)}`;
    try {
      if (document.querySelectorAll(escaped).length === 1) return escaped;
    } catch {}
  }

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    // Try ID as anchor
    if (current.id) {
      const escaped = `#${escapeSelector(current.id)}`;
      try {
        if (document.querySelectorAll(escaped).length === 1) {
          parts.unshift(escaped);
          break;
        }
      } catch {}
    }

    // Add meaningful classes
    const meaningful = Array.from(current.classList)
      .filter((c) => !isGeneratedClass(c))
      .slice(0, 2);
    if (meaningful.length > 0) {
      selector += meaningful.map((c) => `.${escapeSelector(c)}`).join("");
    }

    // Add nth-child if not unique among siblings
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((s) => {
        try {
          return s.matches(selector);
        } catch {
          return s.tagName === current!.tagName;
        }
      });
      if (siblings.length > 1) {
        const index = Array.from(parent.children).indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    parts.unshift(selector);

    // Check if accumulated selector is already unique
    const fullSelector = parts.join(" > ");
    try {
      if (document.querySelectorAll(fullSelector).length === 1) {
        return fullSelector;
      }
    } catch {}

    current = current.parentElement;
  }

  return parts.join(" > ");
}

export function generateXPath(el: Element): string {
  if (el.id) {
    return `//*[@id="${el.id}"]`;
  }

  const parts: string[] = [];
  let current: Node | null = el;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const element = current as Element;
    let part = element.tagName.toLowerCase();

    const parent = element.parentNode;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === element.tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(element) + 1;
        part += `[${index}]`;
      }
    }

    parts.unshift(part);
    current = element.parentNode;

    if (current === document) break;
  }

  return "/" + parts.join("/");
}

export function generateParentChain(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      part += `#${current.id}`;
    } else if (current.classList.length > 0) {
      const cls = Array.from(current.classList).find(
        (c) => !isGeneratedClass(c),
      );
      if (cls) part += `.${cls}`;
    }
    parts.unshift(part);
    current = current.parentElement;
  }

  if (parts.length > 5) {
    return parts.slice(parts.length - 5).join(" > ");
  }
  return parts.join(" > ");
}

export function extractSiblings(el: Element): SiblingInfo[] {
  const siblings: SiblingInfo[] = [];
  const prev = el.previousElementSibling;
  const next = el.nextElementSibling;

  if (prev) {
    siblings.push({
      position: "before",
      tagName: prev.tagName.toLowerCase(),
      classes: Array.from(prev.classList).slice(0, 3),
      textContent: (prev.textContent || "").trim().slice(0, 50),
    });
  }
  if (next) {
    siblings.push({
      position: "after",
      tagName: next.tagName.toLowerCase(),
      classes: Array.from(next.classList).slice(0, 3),
      textContent: (next.textContent || "").trim().slice(0, 50),
    });
  }
  return siblings;
}

export function extractKeyAttributes(
  el: Element,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  const keys = [
    "href",
    "src",
    "alt",
    "title",
    "role",
    "aria-label",
    "type",
    "name",
    "placeholder",
    "data-testid",
  ];
  for (const key of keys) {
    const val = el.getAttribute(key);
    if (val) attrs[key] = val;
  }
  return attrs;
}
