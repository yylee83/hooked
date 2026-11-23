// City suggestions for "Where are you?" after sign-up (components/QuickQuestions.js): type "brook" and pick
// "Brooklyn, NY, United States". Picking from the list means no misspellings.
// The list lives in the repo (lib/places-data.json, made by scripts/make-places.mjs from GeoNames, CC BY 4.0,
// geonames.org): towns of 5,000+ people, biggest first. Nothing is asked of an outside service.
import { NextResponse } from "next/server";
import places from "@/lib/places-data.json";

const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const countryName = new Intl.DisplayNames(["en"], { type: "region" });

// Searchable text for each place, made once: "brooklyn ny united states us".
let index = null;
function getIndex() {
  if (!index) {
    index = places.map(([name, region, country]) => {
      const nation = countryName.of(country) || country;
      return { name, region, country, nation, key: plain(name), full: plain(`${name} ${region} ${nation} ${country}`) };
    });
  }
  return index;
}

export async function GET(request) {
  const q = plain((new URL(request.url).searchParams.get("q") || "").slice(0, 60));
  if (q.length < 2) return NextResponse.json({ places: [] });
  // The town's name starts with what was typed ("brook"), or the whole thing does ("brooklyn ny").
  const out = [];
  for (const p of getIndex()) {
    if (p.key.startsWith(q) || p.full.startsWith(q)) out.push(p);
    if (out.length === 5) break;
  }
  return NextResponse.json(
    { places: out.map((p) => ({ label: [p.name, p.region, p.nation].filter(Boolean).join(", "), place: [p.name, p.region].filter(Boolean).join(", "), country: p.country })) },
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
