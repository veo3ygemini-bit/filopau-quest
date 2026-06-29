const replacements = [
  ["Ã¡", "á"],
  ["Ã©", "é"],
  ["Ã­", "í"],
  ["Ã³", "ó"],
  ["Ãº", "ú"],
  ["Ã±", "ñ"],
  ["Ã", "Á"],
  ["Ã‰", "É"],
  ["Ã", "Í"],
  ["Ã“", "Ó"],
  ["Ãš", "Ú"],
  ["Â¿", "¿"],
  ["Â¡", "¡"],
  ["Âº", "º"],
];

export function cleanText(value) {
  if (typeof value !== "string") return value;
  return replacements.reduce((out, [from, to]) => out.replaceAll(from, to), value);
}

export function normalizeText(value) {
  return cleanText(String(value || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cloneAndClean(value) {
  if (Array.isArray(value)) return value.map(cloneAndClean);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneAndClean(item)]));
  }
  return cleanText(value);
}

export function compact(value, max = 150) {
  const text = cleanText(value || "");
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}
