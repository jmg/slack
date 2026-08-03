/**
 * Phone-number handling. The phone number *is* the account here, so it has to
 * normalise to exactly one canonical string — otherwise "+54 11 2345-6789" and
 * "+541123456789" would register as two different people.
 *
 * We store E.164: a leading "+", then 7–15 digits, no separators. No
 * libphonenumber dependency — we validate the shape, not the carrier plan, and
 * deliberately do not try to guess a country for numbers typed without one.
 *
 * Dependency-free so the sign-up form and the route handler share it.
 */

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Canonicalise user input to E.164, or return null when it can't be.
 *
 * Accepts the separators people actually type (spaces, dashes, dots,
 * parentheses) and the "00" international prefix used across Europe and Latin
 * America. Rejects anything without a country code: guessing one would silently
 * create an account under the wrong number.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Keep a leading "+"; drop every other non-digit.
  const plus = trimmed.startsWith("+");
  let digits = trimmed.replace(/[^\d]/g, "");

  if (!plus) {
    // "00" is the ITU international access prefix — treat it as "+".
    if (digits.startsWith("00")) digits = digits.slice(2);
    else return null;
  }

  const candidate = `+${digits}`;
  return E164.test(candidate) ? candidate : null;
}

export function isE164(value: string): boolean {
  return E164.test(value);
}

/**
 * Country calling codes, longest-first so "+1 242" (Bahamas) wins over "+1".
 * Only used to put one space after the country code when displaying a number —
 * national grouping rules differ per country and getting them wrong looks worse
 * than not grouping at all.
 */
const CALLING_CODES = [
  "1242", "1246", "1264", "1268", "1284", "1345", "1441", "1473", "1649",
  "1664", "1670", "1671", "1684", "1721", "1758", "1767", "1784", "1809",
  "1829", "1849", "1868", "1869", "1876", "1939",
  "212", "213", "216", "218", "220", "221", "222", "223", "224", "225",
  "226", "227", "228", "229", "230", "231", "232", "233", "234", "235",
  "236", "237", "238", "239", "240", "241", "242", "243", "244", "245",
  "248", "249", "250", "251", "252", "253", "254", "255", "256", "257",
  "258", "260", "261", "262", "263", "264", "265", "266", "267", "268",
  "269", "290", "291", "297", "298", "299",
  "350", "351", "352", "353", "354", "355", "356", "357", "358", "359",
  "370", "371", "372", "373", "374", "375", "376", "377", "378", "380",
  "381", "382", "383", "385", "386", "387", "389",
  "420", "421", "423",
  "500", "501", "502", "503", "504", "505", "506", "507", "508", "509",
  "590", "591", "592", "593", "594", "595", "596", "597", "598", "599",
  "670", "672", "673", "674", "675", "676", "677", "678", "679", "680",
  "681", "682", "683", "685", "686", "687", "688", "689", "690", "691", "692",
  "850", "852", "853", "855", "856", "870", "880", "886",
  "960", "961", "962", "963", "964", "965", "966", "967", "968", "970",
  "971", "972", "973", "974", "975", "976", "977", "992", "993", "994",
  "995", "996", "998",
  "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43",
  "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56",
  "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84",
  "86", "90", "91", "92", "93", "94", "95", "98",
  "7", "1",
];

/** "+541123456789" → "+54 1123456789". Returns the input unchanged if it
 *  isn't a well-formed E.164 string. */
export function formatPhone(phone: string): string {
  if (!E164.test(phone)) return phone;
  const digits = phone.slice(1);
  const code = CALLING_CODES.find((c) => digits.startsWith(c));
  return code ? `+${code} ${digits.slice(code.length)}` : phone;
}
