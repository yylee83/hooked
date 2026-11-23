// Builds lib/places-data.json, the city list behind "Where are you?" after sign-up (/api/places).
// Data: GeoNames (geonames.org, CC BY 4.0), by way of two npm packages, so no outside service is asked at run time.
// Run (packages unpacked outside the repo, e.g. with `npm pack all-the-cities cities.json`):
//   node scripts/make-places.cjs <all-the-cities package folder> <cities.json package folder>
// Keeps places with at least MIN_POP people: [name, region, country code], biggest first.
const path = require("path");
const fs = require("fs");
const [citiesDir, adminDir] = process.argv.slice(2);
if (!citiesDir || !adminDir) throw new Error("usage: node scripts/make-places.cjs <all-the-cities dir> <cities.json dir>");
const MIN_POP = 5000;

// all-the-cities stores its list as protocol buffers (cities.pbf). Read it as data here rather than running its code.
function readCities(file) {
  const buf = fs.readFileSync(file);
  let pos = 0;
  const varint = () => {
    let v = 0, shift = 0, b;
    do {
      b = buf[pos++];
      v += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return v;
  };
  const text = () => {
    const n = varint();
    const t = buf.toString("utf8", pos, pos + n);
    pos += n;
    return t;
  };
  const out = [];
  while (pos < buf.length) {
    const end = varint() + pos;
    const c = { name: "", country: "", adminCode: "", population: 0 };
    while (pos < end) {
      const key = varint();
      const tag = key >> 3;
      const type = key & 7;
      if (type === 2) {
        const t = text();
        if (tag === 2) c.name = t;
        else if (tag === 3) c.country = t;
        else if (tag === 8) c.adminCode = t;
      } else if (type === 0) {
        const v = varint();
        if (tag === 9) c.population = v;
      } else throw new Error(`unexpected field type ${type}`);
    }
    out.push(c);
  }
  return out;
}

const cities = readCities(path.join(citiesDir, "cities.pbf"));
const admin1 = new Map(JSON.parse(fs.readFileSync(path.join(adminDir, "admin1.json"), "utf8")).map((a) => [a.code, a.name]));

const seen = new Set();
const rows = cities
  .filter((c) => c.population >= MIN_POP && c.name && /^[A-Z]{2}$/.test(c.country))
  .sort((a, b) => b.population - a.population)
  .map((c) => {
    // US states as their two letters ("Brooklyn, NY"), everywhere else the region's name.
    const region = c.country === "US" ? c.adminCode : admin1.get(`${c.country}.${c.adminCode}`) || "";
    return [c.name, region, c.country];
  })
  .filter(([name, region, country]) => {
    const k = `${name}|${region}|${country}`;
    return !seen.has(k) && seen.add(k);
  });

const out = path.join(__dirname, "..", "lib", "places-data.json");
fs.writeFileSync(out, JSON.stringify(rows));
console.log(`${rows.length} places, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB → lib/places-data.json`);
