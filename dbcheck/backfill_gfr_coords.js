#!/usr/bin/env node
/**
 * Backfill coordinates for GFR scraper listings that have NULL lat/lng.
 *
 * Applies the same geocoding logic as the Python geocode_czech_city():
 *   1. Exact / case-insensitive lookup
 *   2. "Praha X" district patterns → Praha
 *   3. "City - District" split
 *   4. Comma-separated address parts
 *   5. Substring match (longest wins, min 4 chars)
 *
 * Usage:
 *   DB_HOST=... DB_PORT=25432 DB_USER=postgres DB_PASSWORD=... DB_NAME=bazos_scraper node dbcheck/backfill_gfr_coords.js
 *
 * Or if listings-visualization/.env is configured:
 *   node -e "require('dotenv').config({path:'listings-visualization/.env'})" -e "" && node dbcheck/backfill_gfr_coords.js
 */

const { Pool } = require('pg');

// Try loading .env from listings-visualization if available
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', 'listings-visualization', '.env') });
} catch (_) {
  // dotenv not installed or .env not found — rely on env vars
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 25432,
  database: process.env.DB_NAME || 'bazos_scraper',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

// ─── Czech cities map (subset covering GFR auction locations) ───────────────

const CZECH_CITIES = {
  // Regional capitals
  "Praha": [50.0755, 14.4378],
  "Brno": [49.1951, 16.6068],
  "Ostrava": [49.8209, 18.2625],
  "Plzeň": [49.7384, 13.3736],
  "Plzen": [49.7384, 13.3736],
  "Liberec": [50.7663, 15.0543],
  "Olomouc": [49.5938, 17.2509],
  "České Budějovice": [48.9745, 14.4747],
  "Ceske Budejovice": [48.9745, 14.4747],
  "Hradec Králové": [50.2104, 15.8253],
  "Hradec Kralove": [50.2104, 15.8253],
  "Ústí nad Labem": [50.6607, 14.0323],
  "Usti nad Labem": [50.6607, 14.0323],
  "Pardubice": [50.0343, 15.7812],
  "Zlín": [49.2267, 17.6672],
  "Zlin": [49.2267, 17.6672],
  "Jihlava": [49.3961, 15.5912],
  "Karlovy Vary": [50.2325, 12.8714],

  // District capitals
  "Benešov": [49.7818, 14.6869],
  "Beroun": [49.9639, 14.0722],
  "Kladno": [50.1473, 14.1067],
  "Kolín": [50.0283, 15.1998],
  "Kutná Hora": [49.9481, 15.2681],
  "Mělník": [50.3506, 14.4742],
  "Mladá Boleslav": [50.4112, 14.9063],
  "Nymburk": [50.1862, 15.0418],
  "Příbram": [49.6893, 14.0101],
  "Rakovník": [50.1046, 13.7335],
  "Český Krumlov": [48.8127, 14.3175],
  "Jindřichův Hradec": [49.1441, 15.0027],
  "Písek": [49.3088, 14.1475],
  "Prachatice": [49.0125, 13.9974],
  "Strakonice": [49.2613, 13.9024],
  "Tábor": [49.4147, 14.6578],
  "Domažlice": [49.4407, 12.9296],
  "Klatovy": [49.3955, 13.2952],
  "Rokycany": [49.7428, 13.5946],
  "Tachov": [49.7953, 12.6336],
  "Cheb": [50.0796, 12.3714],
  "Sokolov": [50.1814, 12.6401],
  "Děčín": [50.7814, 14.2148],
  "Decin": [50.7814, 14.2148],
  "Chomutov": [50.4606, 13.4175],
  "Litoměřice": [50.5336, 14.1318],
  "Louny": [50.3564, 13.7960],
  "Most": [50.5031, 13.6367],
  "Teplice": [50.6405, 13.8245],
  "Česká Lípa": [50.6858, 14.5378],
  "Jablonec nad Nisou": [50.7274, 15.1710],
  "Semily": [50.6020, 15.3343],
  "Jičín": [50.4371, 15.3519],
  "Náchod": [50.4167, 16.1628],
  "Trutnov": [50.5610, 15.9127],
  "Chrudim": [49.9510, 15.7951],
  "Svitavy": [49.7555, 16.4685],
  "Ústí nad Orlicí": [49.9738, 16.3934],
  "Havlíčkův Brod": [49.6067, 15.5808],
  "Pelhřimov": [49.4314, 15.2232],
  "Třebíč": [49.2148, 15.8817],
  "Žďár nad Sázavou": [49.5627, 15.9393],
  "Blansko": [49.3631, 16.6444],
  "Břeclav": [48.7590, 16.8820],
  "Hodonín": [48.8494, 17.1326],
  "Vyškov": [49.2776, 16.9991],
  "Znojmo": [48.8555, 16.0488],
  "Jeseník": [50.2293, 17.2046],
  "Prostějov": [49.4718, 17.1118],
  "Přerov": [49.4552, 17.4510],
  "Šumperk": [49.9656, 16.9706],
  "Kroměříž": [49.2976, 17.3935],
  "Uherské Hradiště": [49.0698, 17.4597],
  "Vsetín": [49.3388, 17.9960],
  "Bruntál": [49.9884, 17.4647],
  "Frýdek-Místek": [49.6882, 18.3537],
  "Frydek-Mistek": [49.6882, 18.3537],
  "Karviná": [49.8541, 18.5428],
  "Karvina": [49.8541, 18.5428],
  "Nový Jičín": [49.5941, 18.0103],
  "Opava": [49.9381, 17.9045],
  "Havířov": [49.7799, 18.4371],
  "Třinec": [49.6774, 18.6725],

  // Small towns from GFR data
  "Hnojník": [49.7135, 18.5308],
  "Hnojnik": [49.7135, 18.5308],
  "Kožlany": [49.9946, 13.5264],
  "Kozlany": [49.9946, 13.5264],
  "Bechyně": [49.2962, 14.4676],
  "Bechyne": [49.2962, 14.4676],
  "Střekov": [50.6607, 14.0323],
  "Bohuslavice nad Metují": [50.3126, 16.0894],
  "Brodek u Konice": [49.55, 16.8333],
  "Chudčice": [49.288, 16.458],
  "Cvrčovice": [48.9937, 16.5145],
  "Dobročkovice": [49.1630, 17.1048],
  "Dolní Kamenice": [50.7979, 14.4067],
  "Jamolice": [49.0731, 16.2533],
  "Kyšice": [49.7533, 13.4862],
  "Libotenice": [50.4769, 14.2289],
  "Lomnice nad Popelkou": [50.5306, 15.3734],
  "Malonín": [49.6333, 16.65],
  "Milostín": [50.1941, 13.6679],
  "Milovice nad Labem": [50.2260, 14.8886],
  "Milovice": [50.2260, 14.8886],
  "Obrnice": [50.5050, 13.6954],
  "Osová Bitýška": [49.3298, 16.1682],
  "Potštejn": [50.0822, 16.3092],
  "Přečaply": [50.4317, 13.4732],
  "Přechovice": [49.18, 13.89],
  "Rodinov": [49.2828, 15.1038],
  "Sobíňov": [49.6982, 15.7594],
  "Stachy": [49.1018, 13.6666],
  "Valašská Senice": [49.2253, 18.117],
  "Vlastějovice": [49.7313, 15.1748],
  "Záluží": [49.8427, 13.8605],
  "Žežice": [50.6861, 14.0705],
  "Minice": [50.2253, 14.2988],
  "Údlice": [50.4406, 13.4574],
  "Vlkov": [49.3215, 16.2051],

  // Other notable cities
  "Kopřivnice": [49.5994, 18.1448],
  "Český Těšín": [49.7462, 18.6264],
  "Bohumín": [49.9040, 18.3567],
  "Orlová": [49.8455, 18.4302],
  "Hlučín": [49.8977, 18.1929],
  "Krnov": [50.0895, 17.7036],
  "Mariánské Lázně": [49.9646, 12.7013],
  "Turnov": [50.5874, 15.1543],
  "Litomyšl": [49.8689, 16.3125],
  "Vysoké Mýto": [49.9546, 16.1592],
  "Česká Třebová": [49.9050, 16.4442],
  "Lanškroun": [49.9120, 16.6128],
  "Rožnov pod Radhoštěm": [49.4583, 18.1434],
  "Valašské Meziříčí": [49.4718, 17.9718],
  "Otrokovice": [49.2097, 17.5305],
  "Uherský Brod": [49.0267, 17.6475],
  "Frýdlant nad Ostravicí": [49.5923, 18.3579],
  "Příbor": [49.6412, 18.1450],

  // Towns already in Python dict but were missing from JS
  "Podbořany": [50.2283, 13.4152],
  "Pohořelice": [48.9831, 16.5213],
  "Sedlčany": [49.6607, 14.4268],
  "Broumov": [50.5861, 16.3325],
  "Náměšť nad Oslavou": [49.2076, 16.1595],
};

// ─── Geocoding logic (mirrors Python version) ──────────────────────────────

function directLookup(name) {
  if (CZECH_CITIES[name]) return CZECH_CITIES[name];
  const lower = name.toLowerCase();
  for (const [key, coords] of Object.entries(CZECH_CITIES)) {
    if (key.toLowerCase() === lower) return coords;
  }
  return null;
}

function geocodeCzechCity(cityName) {
  if (!cityName || !cityName.trim()) return null;
  const name = cityName.trim();

  // 1. Exact / case-insensitive
  let result = directLookup(name);
  if (result) return result;

  // 2. "Praha X" → Praha
  if (/^Praha\s*\d+/i.test(name)) return CZECH_CITIES["Praha"];

  // 3. "City - District"
  if (name.includes(' - ')) {
    result = directLookup(name.split(' - ')[0].trim());
    if (result) return result;
  }

  // 4. Comma-separated address parts
  if (name.includes(',')) {
    const parts = name.split(',').map(p => p.trim());
    for (const part of parts) {
      result = directLookup(part);
      if (result) return result;
      // Strip trailing house numbers
      const cleaned = part.replace(/\s+\d+[a-zA-Z]?(\/\d+)?$/, '').trim();
      if (cleaned !== part) {
        result = directLookup(cleaned);
        if (result) return result;
      }
    }
  }

  // 5. Substring match (longest first, min 4 chars)
  const nameLower = name.toLowerCase();
  const candidates = [];
  for (const [key, coords] of Object.entries(CZECH_CITIES)) {
    if (key.length >= 4 && nameLower.includes(key.toLowerCase())) {
      candidates.push({ len: key.length, key, coords });
    }
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.len - a.len);
    return candidates[0].coords;
  }

  return null;
}

// ─── Main backfill logic ────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    // Get distinct locations with NULL coordinates for GFR listings
    const { rows: locations } = await client.query(`
      SELECT DISTINCT location
      FROM listings
      WHERE scraper_name = 'gfr'
        AND coordinates_lat IS NULL
        AND location IS NOT NULL
        AND location != ''
    `);

    console.log(`Found ${locations.length} distinct GFR locations with NULL coordinates`);

    let totalUpdated = 0;
    let geocoded = 0;
    let failed = 0;

    for (const { location } of locations) {
      const coords = geocodeCzechCity(location);
      if (coords) {
        const result = await client.query(`
          UPDATE listings
          SET coordinates_lat = $1, coordinates_lng = $2
          WHERE scraper_name = 'gfr'
            AND location = $3
            AND coordinates_lat IS NULL
        `, [coords[0], coords[1], location]);
        totalUpdated += result.rowCount;
        geocoded++;
        console.log(`  ✓ "${location}" → [${coords[0]}, ${coords[1]}] (${result.rowCount} rows)`);
      } else {
        failed++;
        console.log(`  ✗ "${location}" → no match`);
      }
    }

    // Also check listings with NULL/empty location
    const { rows: nullLocations } = await client.query(`
      SELECT COUNT(*) as count
      FROM listings
      WHERE scraper_name = 'gfr'
        AND coordinates_lat IS NULL
        AND (location IS NULL OR location = '')
    `);

    console.log(`\nResults:`);
    console.log(`  Locations geocoded: ${geocoded}`);
    console.log(`  Locations not matched: ${failed}`);
    console.log(`  Total rows updated: ${totalUpdated}`);
    console.log(`  Rows with empty/null location (skipped): ${nullLocations[0].count}`);

    // Final count
    const { rows: remaining } = await client.query(`
      SELECT COUNT(*) as count
      FROM listings
      WHERE scraper_name = 'gfr' AND coordinates_lat IS NULL
    `);
    const { rows: total } = await client.query(`
      SELECT COUNT(*) as count
      FROM listings
      WHERE scraper_name = 'gfr'
    `);
    console.log(`\n  GFR listings with coordinates: ${total[0].count - remaining[0].count} / ${total[0].count}`);
    console.log(`  GFR listings still missing coordinates: ${remaining[0].count}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
