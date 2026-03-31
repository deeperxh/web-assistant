import type { ElementInfo } from "./types";

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function buildTagLine(info: ElementInfo): string {
  let tag = `<${info.tagName}`;
  if (info.id) tag += ` id="${info.id}"`;
  if (info.classes.length > 0) tag += ` class="${info.classes.join(" ")}"`;
  for (const [k, v] of Object.entries(info.attributes)) {
    const truncated = v.length > 60 ? v.slice(0, 60) + "..." : v;
    tag += ` ${k}="${truncated}"`;
  }
  tag += ">";
  return tag;
}

export function buildPrompt(
  info: ElementInfo,
  userDescription: string,
): string {
  const tagLine = buildTagLine(info);

  const stylesBlock = Object.entries(info.styles)
    .filter(
      ([, v]) =>
        v &&
        v !== "none" &&
        v !== "normal" &&
        v !== "0px" &&
        v !== "auto" &&
        v !== "rgba(0, 0, 0, 0)",
    )
    .map(([k, v]) => `- ${camelToKebab(k)}: ${v}`)
    .join("\n");

  const parts: string[] = [
    "I need to modify an element on the page. Here's the element info:",
    "",
    `**CSS Selector**: \`${info.selector}\``,
    `**XPath**: \`${info.xpath}\``,
    `**Tag**: \`${tagLine}\``,
  ];

  if (info.textContent) {
    parts.push(`**Text Content**: "${info.textContent}"`);
  }

  parts.push(`**Parent Chain**: \`${info.parentChain}\``);
  parts.push(
    `**Dimensions**: ${info.boundingBox.width}x${info.boundingBox.height}px`,
  );

  if (stylesBlock) {
    parts.push(`**Computed Styles**:\n${stylesBlock}`);
  }

  if (info.siblings.length > 0) {
    const sibInfo = info.siblings
      .map(
        (s) =>
          `- ${s.position === "before" ? "Previous" : "Next"}: <${s.tagName}${s.classes.length > 0 ? ` class="${s.classes.join(" ")}"` : ""}>${s.textContent ? ` "${s.textContent}"` : ""}`,
      )
      .join("\n");
    parts.push(`**Nearby Siblings**:\n${sibInfo}`);
  }

  parts.push("");
  parts.push(
    `**My Request**: ${userDescription || "[Describe what you want to change]"}`,
  );
  parts.push("");
  parts.push("Please locate this element and make the changes.");

  return parts.join("\n");
}
