import { HOUSING_CLASSES, type HousingClass, type IngestGroup } from "./types";

export const CLASS_DESCRIPTIONS: Record<HousingClass, string> = {
  informal_iron_sheet:
    "informal / temporary structures: iron-sheet (mabati) walls or roof on timber or mud, kiosks, shacks, market stalls",
  semi_permanent:
    "semi-permanent: earth-block, mud-and-wattle or timber walls with cement floor/plaster, small rural homes",
  permanent_masonry: "permanent masonry: fired brick, stone or concrete-block houses, bungalows, small shops with slab floors",
  concrete_rcc:
    "reinforced-concrete frame (RCC): multi-storey blocks, schools, hospitals, warehouses, offices, institutions",
};

/** Local names that map onto a gazetteer entry. */
export const PLACE_ALIASES: Record<string, string> = {
  bunyala: "Budalangi",
  rukala: "Budalangi",
  sigiri: "Budalangi",
  "port vic": "Port Victoria",
  "sio river": "Sio Port",
  "lake victoria": "Port Victoria",
  teso: "Amagoro",
};

export function matchPlace(text: string, placeNames: string[]): string | null {
  const t = text.toLowerCase();
  const candidates: [number, string][] = [
    ...placeNames.map((p): [number, string] => [t.indexOf(p.toLowerCase().replace(/ \(.*\)/, "")), p]),
    ...Object.entries(PLACE_ALIASES).map(([a, p]): [number, string] => [t.indexOf(a), p]),
  ].filter(([i]) => i >= 0);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a[0] - b[0])[0][1];
}

const CLASS_KEYWORDS: [HousingClass, RegExp][] = [
  ["concrete_rcc", /\b(rcc|reinforced|concrete[- ]frame|multi[- ]?stor(e)?y|(?:[2-9]|two|three|four|five)[- ]stor(e)?y|apartment|warehouse|godown|school|hospital|clinic|office|mall|factory|institution)\w*/i],
  ["semi_permanent", /\b(semi[- ]?permanent|mud[- ]and[- ]wattle|wattle|earth[- ]?block|timber|wooden|mud[- ]?walled|mud|udongo)\w*/i],
  ["informal_iron_sheet", /\b(informal|iron[- ]?sheet|mabati|shack|kiosk|stall|temporary|makeshift|tin)\w*/i],
  ["permanent_masonry", /\b(masonry|brick|stone|block|bungalow|permanent|maisonette|concrete)\w*/i],
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, dozen: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

const RIVER_RE = /\b(river|riverside|riverbank|banks?|flood ?plain|lake ?(shore|side)|lakeshore|shore(line)?|dyke|dike|swamp|wetland|waterfront|near the water|mto)\b/i;

function parseMoney(text: string): number | null {
  const m =
    text.match(/(?:kes|ksh|kshs)\.?\s*([\d][\d,]*(?:\.\d+)?)\s*(m|mn|million|k|thousand|bn|billion)?\b/i) ??
    text.match(/([\d][\d,]*(?:\.\d+)?)\s*(m|mn|million|k|thousand|bn|billion)?\s*(?:kes|ksh|kshs|shillings)\b/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ""));
  const unit = (m[2] || "").toLowerCase();
  const mult = unit.startsWith("b") ? 1e9 : unit.startsWith("m") ? 1e6 : unit.startsWith("k") || unit === "thousand" ? 1e3 : 1;
  return v * mult;
}

function stripQuantities(text: string) {
  return text
    .replace(/(?:kes|ksh|kshs)\.?\s*[\d,.]+\s*(?:m|mn|million|k|thousand|bn|billion)?/gi, " ")
    .replace(/[\d,.]+\s*(?:m|mn|million|k|thousand|bn|billion)?\s*(?:kes|ksh|kshs|shillings)/gi, " ")
    .replace(/[\d.]+\s*(?:m2|m²|sqm|sq\.? ?m|square met(?:re|er)s?)/gi, " ")
    .replace(/[\d.]+\s*(?:m|metres?|meters?|cm)\b/gi, " ")
    .replace(/[\d.]+\s*(?:days?|weeks?|%|percent|km|storeys?|floors?)\b/gi, " ");
}

function parseCount(text: string): number | null {
  const cleaned = stripQuantities(text);
  const num = cleaned.match(/\b(\d{1,4})\b/);
  const word = cleaned.toLowerCase().match(/\b(a dozen|dozen|an?|one|single|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\b/);
  if (num && (!word || num.index! <= word.index!)) return parseInt(num[1], 10);
  if (word) return NUMBER_WORDS[word[1].replace("a dozen", "dozen")];
  return null;
}

/**
 * Transparent keyword/regex parser used when no LLM is configured. It handles straightforward descriptions;
 * the LLM path handles paraphrase, local vocabulary and implicit attributes much better.
 */
export function ruleBasedParse(text: string, placeNames: string[]): { groups: IngestGroup[]; warnings: string[] } {
  const warnings: string[] = [];
  const clauses = text
    .split(/(?:\.(?=\s|$)|[;\n]+|,\s+(?![\d.,]+\s*(?:m2|m²|sqm|sq\.? ?m|square|m\b|metres?|kes|ksh))(?=(?:and\s+)?(?:\d|an?\s|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|fifty|a dozen))|\s+and\s+(?=(?:\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|fifty|a dozen)\s+(?!m\b|m2|m²|sqm|metres?|meters?|kes|ksh|days?|weeks?|half\b))|\band also\b|\bplus\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
  let lastPlace: string | null = null;
  const groups: IngestGroup[] = [];
  for (const clause of clauses) {
    const count = parseCount(clause);
    const clsHit = CLASS_KEYWORDS.find(([, re]) => re.test(clause));
    const placeHit = matchPlace(clause, placeNames);
    if (placeHit) lastPlace = placeHit;
    if ((count == null && !clsHit) || count === 0) continue;
    const assumptions: string[] = [];
    let cls: HousingClass = "semi_permanent";
    if (clsHit) {
      cls = clsHit[0];
      assumptions.push(`"${clause.match(clsHit[1])?.[0]}" mapped to ${cls}`);
    } else {
      assumptions.push("no construction keyword found — defaulted to semi_permanent");
    }
    const area = clause.match(/([\d.]+)\s*(?:m2|m²|sqm|sq\.? ?m|square met(?:re|er)s?)/i);
    let tiv = parseMoney(clause);
    const n = count ?? 1;
    if (tiv && /\b(total|combined|altogether|in all|portfolio)\b/i.test(clause) && n > 1) {
      tiv = tiv / n;
      assumptions.push("stated value treated as a total and split evenly");
    }
    const plinthM = clause.match(/(?:raised|stilts|plinth|elevated)[^.]*?([\d.]+)\s*(?:m|metres?|meters?)\b/i);
    const cm = clause.match(/(?:raised|stilts|plinth|elevated)[^.]*?(\d+)\s*cm\b/i);
    let plinth = plinthM ? parseFloat(plinthM[1]) : cm ? parseInt(cm[1], 10) / 100 : 0;
    if (!plinth && /\b(stilts|raised|elevated)\b/i.test(clause)) {
      plinth = 0.5;
      assumptions.push("'raised/stilts' without a height — assumed 0.5 m extra floor height");
    }
    const occ = clause.match(/\b(shops?|dukas?|homes?|houses?|nyumba|schools?|warehouses?|clinics?|hospitals?|offices?|stores?|kiosks?|stalls?|churches?|hotels?|godowns?)\b/i);
    if (count == null) assumptions.push("no count found — assumed 1 building");
    if (!placeHit && lastPlace) assumptions.push(`location carried over from earlier mention of ${lastPlace}`);
    groups.push({
      count: n,
      housing_class: cls,
      place: placeHit ?? lastPlace,
      lat: null,
      lon: null,
      near_river: RIVER_RE.test(clause),
      floor_area_m2: area ? parseFloat(area[1]) : null,
      cost_per_m2_kes: null,
      tiv_kes_each: tiv,
      plinth_m: plinth,
      occupancy: occ ? occ[1].toLowerCase() : null,
      evidence: clause,
      confidence: clsHit && count != null && (placeHit || lastPlace) ? 0.6 : 0.35,
      assumptions,
    });
  }
  if (!groups.length) warnings.push("The rule-based parser found no buildings. Try e.g. '12 iron-sheet shops near the river in Budalangi'.");
  return { groups, warnings };
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Validates and coerces untrusted (LLM) output into IngestGroup rows; never trusts the model blindly. */
export function sanitizeGroups(raw: unknown, placeNames: string[]): { groups: IngestGroup[]; warnings: string[] } {
  const warnings: string[] = [];
  const obj = (raw ?? {}) as { groups?: unknown[]; warnings?: unknown[] };
  const list = Array.isArray(obj.groups) ? obj.groups : [];
  const groups: IngestGroup[] = [];
  for (const [i, gRaw] of list.entries()) {
    const g = (gRaw ?? {}) as Record<string, unknown>;
    let cls = String(g.housing_class ?? "") as HousingClass;
    if (!HOUSING_CLASSES.includes(cls)) {
      const hit = CLASS_KEYWORDS.find(([, re]) => re.test(String(g.housing_class ?? "") + " " + String(g.evidence ?? "")));
      warnings.push(`Group ${i + 1}: unknown class "${String(g.housing_class)}" → ${hit ? hit[0] : "semi_permanent"}`);
      cls = hit ? hit[0] : "semi_permanent";
    }
    const count = Math.round(num(g.count) ?? 1);
    if (count < 1 || count > 500) {
      warnings.push(`Group ${i + 1}: count ${count} outside 1–500, clamped`);
    }
    let place = g.place == null ? null : String(g.place);
    if (place && !placeNames.some((p) => p.toLowerCase() === place!.toLowerCase())) {
      const fuzzy =
        placeNames.find((p) => place!.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(place!.toLowerCase())) ??
        matchPlace(place, placeNames);
      if (fuzzy) place = fuzzy;
      else {
        warnings.push(`Group ${i + 1}: place "${place}" is not in the Nzoia gazetteer — location will fall back to Budalangi`);
        place = null;
      }
    }
    let lat = num(g.lat);
    let lon = num(g.lon);
    if (lat != null && lon != null && (lat < -0.3 || lat > 1.3 || lon < 33.7 || lon > 35.4)) {
      warnings.push(`Group ${i + 1}: coordinates (${lat}, ${lon}) outside the hazard grid — ignored`);
      lat = lon = null;
    }
    const pos = (v: unknown) => {
      const n = num(v);
      return n != null && n > 0 ? n : null;
    };
    groups.push({
      count: Math.max(1, Math.min(500, count)),
      housing_class: cls,
      place,
      lat,
      lon,
      near_river: Boolean(g.near_river),
      floor_area_m2: pos(g.floor_area_m2),
      cost_per_m2_kes: pos(g.cost_per_m2_kes),
      tiv_kes_each: pos(g.tiv_kes_each),
      plinth_m: Math.min(3, Math.max(0, num(g.plinth_m) ?? 0)),
      occupancy: g.occupancy == null ? null : String(g.occupancy).slice(0, 60),
      evidence: String(g.evidence ?? "").slice(0, 300),
      confidence: Math.min(1, Math.max(0, num(g.confidence) ?? 0.5)),
      assumptions: Array.isArray(g.assumptions) ? g.assumptions.map((a) => String(a).slice(0, 200)).slice(0, 8) : [],
    });
  }
  if (Array.isArray(obj.warnings)) warnings.push(...obj.warnings.map((w) => String(w).slice(0, 200)));
  return { groups, warnings };
}

export function ingestSystemPrompt(placeNames: string[]) {
  return `You convert property descriptions in the lower Nzoia basin (Busia/Siaya/Kakamega/Bungoma, Kenya) into structured exposure rows for a flood catastrophe model that prices BUILDING STRUCTURES ONLY.

The input is either a short free-text description ("12 mabati shops in Budalangi") or a full underwriting document (offer slip, survey report, broker submission) with headers, contacts, policy terms, machinery schedules and loss history.

WHAT TO EXTRACT — only physical buildings/structures that would be insured:
- One group per distinct building (or per set of identical buildings). A building heading (e.g. "WAREHOUSE UNIT #1", "Office building") and the attribute lines under it (Construction, Area, Roof, Foundation, base/plinth height, Condition) describe ONE building — merge them into a single group with count 1.
- Small ancillary structures listed with their own area/construction (guardhouse, shed, office block) are separate groups.

WHAT TO IGNORE — never turn these into groups or counts:
- phone numbers, dates, years (construction/installation/renovation years), reference/policy numbers, unit numbers like "#2", coordinates, elevations, roof pitch, capacities (tons/hour), percentages, flood-event counts, loss amounts;
- machinery, equipment, stock and contents (the model is structure-only) — mention in "warnings" that they were excluded;
- site/portfolio TOTALS (total area, total footprint, total sum insured) that duplicate itemised buildings — use them only to check consistency or to apportion values.

Return ONLY a JSON object: {"groups": [...], "warnings": [...]}.
Each group describes identical buildings and has exactly these keys:
- "count": integer number of buildings (1-500)
- "housing_class": one of
${HOUSING_CLASSES.map((c) => `    "${c}" = ${CLASS_DESCRIPTIONS[c]}`).join("\n")}
- "place": the matching name from this gazetteer, or null if none is mentioned: ${placeNames.join(", ")}
  (local aliases: ${Object.entries(PLACE_ALIASES).map(([a, p]) => `${a} → ${p}`).join("; ")})
- "lat", "lon": decimal degrees ONLY if coordinates are explicitly stated, else null. Site coordinates apply to every building at that site. Convert degrees-minutes-seconds; S and W are negative.
- "near_river": true if the text places them by the river, banks, floodplain, lake shore, dyke or swamp (a stated distance to the river of under ~500 m counts)
- "floor_area_m2": per building, only if stated (null otherwise). "2,100 m²" -> 2100.
- "cost_per_m2_kes": only if stated (null otherwise)
- "tiv_kes_each": building sum insured / replacement value PER BUILDING in KES if stated (buildings only — exclude machinery, stock and contents); if only a total buildings value is stated, divide by count, or apportion across buildings by floor area and say so in "assumptions". Convert "2.5M" -> 2500000; convert other currencies only if a rate is stated. null if not stated.
- "plinth_m": floor height above surrounding ground in metres if the text says raised/on stilts/plinth/elevated floor/concrete base X m high (e.g. "raised 60cm" -> 0.6); 0 if not mentioned
- "occupancy": short use label (e.g. "grain warehouse", "office", "homes") or null
- "evidence": a short exact quote (the building heading, max ~150 characters) from the input that this group came from
- "confidence": 0-1, your confidence in the classification and attributes
- "assumptions": list of short strings explaining every judgement call (e.g. "'mabati' interpreted as informal iron sheet", "'dukas' = small shops")

Classify by the walls and frame actually described, not by occupancy alone: corrugated iron sheet walls on timber -> informal_iron_sheet; sheet cladding on a steel or reinforced-concrete frame, or mixed iron/block walls -> choose between semi_permanent and permanent_masonry and explain; brick/block -> permanent_masonry; full RC frame with masonry infill -> concrete_rcc. Explain the choice in "assumptions".

Rules: never invent numbers that are not in the text — use null and let the model apply documented defaults. If the property is clearly outside the lower Nzoia basin, still return its groups with "place": null and add a warning that the hazard results will not be meaningful. Map Swahili/local terms (mabati = iron sheet, duka = shop, nyumba = house, shule = school, godown = warehouse). If a place is not in the gazetteer, set "place" to the closest gazetteer town you are confident about and add an assumption, or null with a warning. Put anything you could not interpret into "warnings".`;
}
