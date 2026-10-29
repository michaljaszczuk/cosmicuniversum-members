// The name rule, shared by the order form and the server (functions/_shared/order-check.js).
// No imports: the server bundle must not pull in the browser-only chart modules.
// The PDF fonts print Latin, Greek and Cyrillic letters (tools/report/build_report.py name_text).
export const NAME_OK = /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{M} .'’-]+$/u;
export const NAME_TEXT = 'Use only letters, spaces, dots, apostrophes and dashes in your name. We can print Latin, Greek and Cyrillic letters.';
