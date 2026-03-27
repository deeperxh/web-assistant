import zhCN from "../../locales/zh-CN.json";
import en from "../../locales/en.json";

type LocaleMessages = Record<string, string>;

const locales: Record<string, LocaleMessages> = {
  "zh-CN": zhCN,
  en,
};

let currentLocale = "zh-CN";

export function setLocale(locale: string) {
  currentLocale = locale;
}

export function getLocale(): string {
  return currentLocale;
}

export function t(key: string, params?: Record<string, string>): string {
  const messages = locales[currentLocale] || locales["zh-CN"];
  let text = messages[key] || key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }

  return text;
}
