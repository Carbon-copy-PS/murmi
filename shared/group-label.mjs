// Stable spreadsheet-style labels: A…Z, AA…AZ, BA… .
export function groupLabel(id) {
  if (!Number.isSafeInteger(id) || id < 0 || id === Number.MAX_SAFE_INTEGER) return '?';
  let value = id + 1, label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
