"""What the AI may see: chart facts without anything that names the customer.

Removed: input (name, date, time, place, coordinates), lons, timeCheck (holds clock times),
items.name / birthPlace / birthDate / birthTime, and the dates in saturnReturns.
Planet positions alone can in theory point to a birth date; the privacy note says so.
"""
import copy

DROP_TOP = ("input", "lons", "timeCheck")
DROP_ITEMS = ("name", "birthPlace", "birthDate", "birthTime")


def redact(facts):
    out = copy.deepcopy(facts)
    for k in DROP_TOP:
        out.pop(k, None)
    for k in DROP_ITEMS:
        out.get("items", {}).pop(k, None)
    out["saturnReturns"] = [{"n": x["n"], "status": x["status"]} for x in facts.get("saturnReturns", [])]
    return out
