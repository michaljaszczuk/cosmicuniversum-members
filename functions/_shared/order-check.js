// Server check of a report order from the form. The browser checks the same things first;
// this check is the one that counts. Error texts are shown to the customer under the field.
import { checkDate, checkTime } from "../../public/tools/js/input.js";
import { localToUtc } from "../../public/tools/js/time.js";
import { NAME_OK, NAME_TEXT } from "../../public/report/js/name-rule.js";

const MAX_LAT = 66; // conventions.json maxLatitude: beyond it the Rising sign can be undefined
const TIME_SOURCES = ["record", "parent", "guess"];
const SURE = [0, 15, 30, 60];

const fail = (field, error) => ({ ok: false, field, error });

/**
 * @param {object} body the JSON the form posts
 * @param {{findPlace: (p) => Promise<{name,country,admin1,lat,lon,tz}|null>, now: number}} deps
 * @returns {Promise<{ok:true, order:object} | {ok:false, field:string, error:string}>}
 *   order has no id, status or createdAt yet; the caller adds them.
 */
export async function checkOrder(body, { findPlace, now }) {
  const b = body && typeof body === "object" ? body : {};
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    return fail("name", "Enter the name to print on your report, up to 60 letters.");
  }
  if (!NAME_OK.test(name)) return fail("name", NAME_TEXT);
  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail("email", "Enter a working email address. Your report goes there.");
  }
  const date = checkDate(b.date);
  if (!date.ok) return fail("date", date.error);
  const today = new Date(now).toISOString().slice(0, 10);
  if (String(b.date).trim() > today) return fail("date", "This date is in the future. Check the year.");
  const time = checkTime(b.time);
  if (!time.ok) return fail("time", "Your report needs a birth time. Enter it as hours and minutes.");

  const p = b.place && typeof b.place === "object" ? b.place : {};
  const town = typeof p.name === "string" && typeof p.country === "string" && typeof p.lat === "number" && typeof p.lon === "number"
    ? await findPlace({ name: p.name, country: p.country, lat: p.lat, lon: p.lon })
    : null;
  if (!town) return fail("place", "Pick your birth town from the list.");
  if (Math.abs(town.lat) > MAX_LAT) {
    return fail("place", "We can't make this report for places this far north or south yet.");
  }

  const r = localToUtc({ ...date.value, ...time.value }, town.tz);
  let fold = null;
  if (r.status === "missing") {
    return fail("time", "In this place the clocks moved forward on this date, so this time did not exist. Check your birth time.");
  }
  if (r.status === "ambiguous") {
    if (b.fold !== 0 && b.fold !== 1) {
      return fail("fold", "The clocks went back on this night, so this time happened twice. Pick the earlier or the later one.");
    }
    fold = b.fold;
  } else if (b.fold !== null && b.fold !== undefined) {
    return fail("fold", "This time happened only once. Remove the earlier or later choice.");
  }

  if (!TIME_SOURCES.includes(b.timeSource)) return fail("timeSource", "Tell us where your birth time comes from.");
  if (!SURE.includes(b.sure)) return fail("sure", "Tell us how sure you are of your birth time.");
  if (typeof b.riskAccepted !== "boolean") return fail("riskAccepted", "Please answer the birth time question.");
  if (b.consentPrivacy !== true) return fail("consentPrivacy", "Please tick the privacy box. We need it to make your report.");
  if (b.consentWaiver !== true) return fail("consentWaiver", "Please tick the box about getting your report now.");

  return {
    ok: true,
    order: {
      email, name,
      birth: {
        date: String(b.date).trim(), time: `${String(time.value.h).padStart(2, "0")}:${String(time.value.mi).padStart(2, "0")}`,
        fold, place: [town.name, town.admin1, town.country].filter(Boolean).join(", "),
        lat: town.lat, lon: town.lon, tz: town.tz,
        timeSource: b.timeSource, sure: b.sure, riskAccepted: b.riskAccepted,
      },
      consents: { privacy: true, waiver: true, at: new Date(now).toISOString() },
    },
  };
}
