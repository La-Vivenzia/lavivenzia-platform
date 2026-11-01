import "../src/lib/load-env";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { GoogleMapsAdapter } from "../src/adapters/maps/google";
import { PILOT_EXPERIENCES, type PilotExperienceInput } from "../src/data/pune-pilot";
import type { PlaceMatch } from "../src/ports/maps";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE_PATH = path.resolve(__dirname, "../src/data/pune-pilot.ts");

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCoreBrand(venueName: string): string {
  const norm = normalize(venueName);
  const descriptors = [
    "laser tag arena high score arcade experience",
    "laser tag arena",
    "urban lounge bar",
    "urban lounge",
    "lounge bar",
    "brewhouse",
    "haven",
    "rooftop cocktails",
    "arena",
    "vip",
    "oasis",
  ];
  let cleaned = norm;
  for (const d of descriptors) {
    if (cleaned.endsWith(d)) {
      cleaned = cleaned.slice(0, -d.length).trim();
      break;
    }
  }
  if (cleaned.startsWith("the ")) {
    cleaned = cleaned.slice(4).trim();
  }
  return cleaned;
}

export function isExactMatch(
  exp: Pick<PilotExperienceInput, "title" | "addressLine">,
  match: PlaceMatch | null,
): boolean {
  if (!match || !match.id || !match.name) return false;

  const colonIdx = exp.title.indexOf(":");
  const venueName = colonIdx !== -1 ? exp.title.slice(0, colonIdx).trim() : exp.title.trim();

  const coreBrand = extractCoreBrand(venueName);
  const normMatchedName = normalize(match.name);
  const normAddress = normalize(match.address);
  const normListingAddress = normalize(exp.addressLine);

  // 1. Generic mall/building names are not venue matches
  const genericPlaceNames = [
    "amanora mall",
    "seasons mall",
    "amanora town centre",
    "oasis",
    "destination centre",
  ];
  if (genericPlaceNames.includes(normMatchedName)) {
    return false;
  }

  // 2. Brand name match check
  const brandMatches =
    normMatchedName.includes(coreBrand) ||
    (coreBrand === "absolute barbecues" && normMatchedName.includes("ab s")) ||
    (coreBrand === "cinepolis" && normMatchedName.includes("cinepolis")) ||
    (coreBrand === "cafe peter" && normMatchedName.includes("cafe peter"));

  if (!brandMatches) {
    return false;
  }

  // 3. Location anchor checks: ensure venue is in the intended mall / development
  if (
    normListingAddress.includes("amanora") &&
    !normAddress.includes("amanora") &&
    !normMatchedName.includes("amanora")
  ) {
    return false;
  }
  if (
    normListingAddress.includes("seasons") &&
    !normAddress.includes("seasons") &&
    !normMatchedName.includes("seasons")
  ) {
    return false;
  }
  if (
    normListingAddress.includes("magarpatta") &&
    !normAddress.includes("magarpatta") &&
    !normMatchedName.includes("magarpatta")
  ) {
    return false;
  }

  // 4. Reject if matched address explicitly states a different locality
  const foreignAreas = [
    "viman nagar",
    "kalyani nagar",
    "freedom high street",
    "baner",
    "kothrud",
    "wakad",
    "hinjewadi",
  ];
  for (const foreign of foreignAreas) {
    if (normAddress.includes(foreign) && !normListingAddress.includes(foreign)) {
      return false;
    }
  }

  return true;
}

export function updatePilotDataFile(
  filePath: string,
  verifiedMap: Map<string, string>,
): {
  changed: { slug: string; placeId: string }[];
  verified: { slug: string; placeId: string }[];
} {
  let content = fs.readFileSync(filePath, "utf-8");

  // Ensure interface has googlePlaceId?: string if missing
  if (!/interface\s+PilotExperienceInput\s*\{[^}]*googlePlaceId\?:\s*string;/.test(content)) {
    content = content.replace(
      /(interface\s+PilotExperienceInput\s*\{[\s\S]*?altText:\s*string;)/,
      "$1\n  googlePlaceId?: string;",
    );
  }

  const changed: { slug: string; placeId: string }[] = [];
  const verified: { slug: string; placeId: string }[] = [];

  for (const [slug, placeId] of verifiedMap.entries()) {
    verified.push({ slug, placeId });
    const blockRegex = new RegExp(`(\\{\\s*slug:\\s*["']${slug}["'][\\s\\S]*?\\n  \\})`);
    const match = content.match(blockRegex);
    if (!match) continue;

    const originalBlock = match[0];
    let newBlock: string;

    if (originalBlock.includes("googlePlaceId:")) {
      newBlock = originalBlock.replace(
        /googlePlaceId:\s*["'][^"']*["']/,
        `googlePlaceId: "${placeId}"`,
      );
    } else {
      newBlock = originalBlock.replace(
        /(altText:\s*["'][^"']+["'],?)/,
        `$1\n    googlePlaceId: "${placeId}",`,
      );
    }

    if (newBlock !== originalBlock) {
      content = content.replace(originalBlock, newBlock);
      changed.push({ slug, placeId });
    }
  }

  fs.writeFileSync(filePath, content, "utf-8");
  return { changed, verified };
}

async function main(): Promise<void> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    console.error("GOOGLE_MAPS_API_KEY must be set to run this script.");
    process.exit(1);
  }

  const adapter = new GoogleMapsAdapter(
    { apiKey },
    {
      logger: () => pino({ level: "warn" }),
    },
  );

  interface TableRow {
    slug: string;
    "matched name": string | null;
    "matched address": string | null;
    placeId: string | null;
    status: "VERIFIED" | "SKIPPED";
  }

  const rows: TableRow[] = [];
  const verifiedMap = new Map<string, string>();

  for (const exp of PILOT_EXPERIENCES) {
    const colonIdx = exp.title.indexOf(":");
    const venueName = colonIdx !== -1 ? exp.title.slice(0, colonIdx).trim() : exp.title.trim();
    const query = `${venueName} ${exp.addressLine}`.trim();

    const match = await adapter.findPlaceId({
      query,
      latitude: exp.latitude,
      longitude: exp.longitude,
    });

    const exact = isExactMatch(exp, match);
    if (exact && match?.id) {
      verifiedMap.set(exp.slug, match.id);
    }

    rows.push({
      slug: exp.slug,
      "matched name": match?.name ?? null,
      "matched address": match?.address ?? null,
      placeId: match?.id ?? null,
      status: exact ? "VERIFIED" : "SKIPPED",
    });
  }

  console.table(rows);

  const { changed, verified } = updatePilotDataFile(DATA_FILE_PATH, verifiedMap);
  console.log(`\nVerified Google Place IDs in src/data/pune-pilot.ts (${verified.length} verified):`);
  for (const item of verified) {
    const isNew = changed.some((c) => c.slug === item.slug);
    console.log(`  ✓ ${item.slug}: ${item.placeId}${isNew ? " (newly written)" : ""}`);
  }
}

void main().catch((err: unknown) => {
  console.error("Failed to resolve place IDs:", err);
  process.exit(1);
});
