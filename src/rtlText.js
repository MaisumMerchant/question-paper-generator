// Arabic-script text needs browser shaping and bidirectional layout in PDF output.
export function hasArabicScript(value) {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(String(value ?? ''));
}
