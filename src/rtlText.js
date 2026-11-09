// Arabic-script text needs browser shaping and bidirectional layout in PDF output.
export function hasArabicScript(value) {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(String(value ?? ''));
}

// Choose paragraph direction from the first strong letter, not from the
// mere presence of Arabic inside otherwise English prose.
export function textDirection(value, preferEnglish = false) {
  if (preferEnglish && /[A-Za-z]/u.test(String(value ?? ""))) return "ltr";
  const first = String(value ?? "").match(/\p{L}/u)?.[0];
  return first && hasArabicScript(first) ? "rtl" : "ltr";
}
