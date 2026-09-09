/*
  Music Release Tracker — free weekly updater
  -------------------------------------------
  This version does NOT use paid Apple Music API credentials.

  What it does:
  1. Reads your Apple Music playlist links from config/playlists.json.
  2. Tries to pull visible "Featured Artists" from each public playlist page.
  3. Merges those names with config/artists.json, which is your editable artist list.
  4. Searches free public data sources for recent/upcoming music:
     - iTunes Search API first
     - MusicBrainz as a backup
  5. Auto-sorts releases into your genre list.
  6. Writes data/releases.json for the website.

  Best part: no API keys, no Apple Developer account, no secrets.
*/

const fs = require("fs/promises");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "config", "playlists.json");
const ARTISTS_PATH = path.join(ROOT, "config", "artists.json");
const OUTPUT_PATH = path.join(ROOT, "data", "releases.json");

const SETTINGS = {
  country: process.env.ITUNES_COUNTRY || "US",
  lookBackDays: Number(process.env.RELEASE_LOOKBACK_DAYS || 90),
  lookAheadDays: Number(process.env.RELEASE_LOOKAHEAD_DAYS || 365),
  maxArtists: Number(process.env.MAX_ARTISTS || 250),
  maxReleasesPerArtist: Number(process.env.MAX_RELEASES_PER_ARTIST || 12),
  requestDelayMs: Number(process.env.REQUEST_DELAY_MS || 1100),
  includeMusicBrainz: String(process.env.INCLUDE_MUSICBRAINZ || "true").toLowerCase() !== "false"
};

const GENRES = [
  "Rap",
  "Rock",
  "Pop",
  "Metal",
  "Country",
  "Alternative",
  "Grunge",
  "R&B/Soul",
  "Americana",
  "Reggae"
];

const GENRE_KEYWORDS = {
  Rap: ["rap", "hip-hop", "hip hop", "trap", "drill", "gangsta rap"],
  Rock: ["rock", "classic rock", "hard rock", "southern rock", "psychedelic rock", "arena rock"],
  Pop: ["pop", "dance pop", "electropop", "teen pop", "pop rock"],
  Metal: ["metal", "nu metal", "heavy metal", "metalcore", "hardcore", "thrash", "deathcore"],
  Country: ["country", "modern country", "country pop", "country rock", "outlaw country"],
  Alternative: ["alternative", "alt", "indie", "emo", "post-hardcore", "punk", "new wave", "dream pop", "shoegaze"],
  Grunge: ["grunge", "post-grunge", "seattle sound"],
  "R&B/Soul": ["r&b", "rnb", "soul", "neo soul", "contemporary r&b", "rhythm and blues"],
  Americana: ["americana", "folk", "roots", "singer-songwriter", "red dirt", "bluegrass", "alt-country"],
  Reggae: ["reggae", "ska", "dub", "roots reggae", "reggae rock", "rocksteady"]
};

const ARTIST_HINTS = {
  Rap: ["2pac", "baby smoove", "doe boy", "drake", "future", "gucci mane", "lil durk", "polo g", "rich homie quan", "rylo rodriguez", "veeeze", "veeze", "youngboy never broke again"],
  Rock: ["3 doors down", "aerosmith", "asia", "audioslave", "billy idol", "blue öyster cult", "bob seger", "bon jovi", "bush", "eagles", "eddie money", "europe", "foo fighters", "journey", "led zeppelin", "lynyrd skynyrd", "night ranger", "queen", "red hot chili peppers", "scorpions", "the cars", "the police"],
  Pop: ["abba", "bruno mars", "capital cities", "coldplay", "george michael", "gotye", "jason derulo", "jennifer lopez", "justin timberlake", "maroon 5", "michael jackson", "mike posner", "pitbull", "rihanna", "selena gomez & the scene", "taio cruz", "the weeknd"],
  Metal: ["chevelle", "deftones", "judas priest", "korn", "linkin park", "loathe", "marilyn manson", "pierce the veil", "thirty seconds to mars", "three days grace", "‡‡‡ (crosses)", "crosses"],
  Country: ["cal smith", "charles wesley godwin", "david allan coe", "ella langley", "flatland cavalry", "gavin adcock", "glen campbell", "highwaymen", "johnny cash", "koe wetzel", "kris kristofferson", "ole 60", "the charlie daniels band", "turnpike troubadours", "vincent mason", "waylon jennings", "willie nelson", "zach bryan"],
  Alternative: ["arctic monkeys", "beach house", "beach weather", "cage the elephant", "cigarettes after sex", "crowded house", "duran duran", "echo & the bunnymen", "empire of the sun", "fontaines d.c.", "inxs", "james", "mac demarco", "mazzy star", "men i trust", "milky chance", "neon trees", "orchestral manoeuvres in the dark", "portishead", "radiohead", "santigold", "slowdive", "stereophonics", "tame impala", "the 1975", "the cure", "the fray", "the last shadow puppets", "the marías", "the neighbourhood", "the rose hips", "the smiths", "u2", "weezer", "weyes blood", "wilco"],
  Grunge: ["alice in chains", "nirvana", "pearl jam", "soundgarden", "the smashing pumpkins"],
  "R&B/Soul": ["aaliyah", "amy winehouse", "blu cantrell", "frank ocean", "lauryn hill", "mary j. blige", "otis redding", "sa deuce", "tlc"],
  Americana: ["bon iver", "john mayer", "marcus king", "nicholas jamerson", "ray lamontagne", "the morning jays", "the paper kites"],
  Reggae: ["big mountain", "bob marley & the wailers", "hollie cook", "inner circle", "men at work", "no doubt", "rebelution", "slightly stoopid", "sublime", "ub40"]
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function normalizeName(name) {
  return String(name || "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function artistKey(name) {
  return normalizeName(name).toLowerCase();
}

function addArtist(map, artist) {
  const name = normalizeName(typeof artist === "string" ? artist : artist.name);
  if (!name || name.length < 2) return;

  const key = artistKey(name);
  const existing = map.get(key) || { name, genreHints: [] };
  const hints = typeof artist === "string" ? [] : artist.genreHints || [];
  existing.genreHints = [...new Set([...(existing.genreHints || []), ...hints.filter(Boolean)])];
  map.set(key, existing);
}

function inferGenre(tags = [], artistName = "") {
  const lowerArtist = artistKey(artistName);

  for (const [genre, artists] of Object.entries(ARTIST_HINTS)) {
    if (artists.includes(lowerArtist)) return genre;
  }

  const normalizedTags = tags.map((tag) => String(tag).toLowerCase()).filter(Boolean);
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    if (normalizedTags.some((tag) => keywords.some((keyword) => tag.includes(keyword)))) {
      return genre;
    }
  }

  return "Other";
}

function releaseIsInWindow(releaseDate) {
  if (!releaseDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(`${releaseDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;

  const diffDays = Math.floor((date - today) / (1000 * 60 * 60 * 24));
  return diffDays >= -SETTINGS.lookBackDays && diffDays <= SETTINGS.lookAheadDays;
}

function getStatus(releaseDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${releaseDate.slice(0, 10)}T00:00:00`);
  const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));

  if (date > today) return "Upcoming";
  if (diffDays >= 0 && diffDays <= 7) return "New";
  return "Already Dropped";
}

function cleanTitle(title) {
  return normalizeName(title).replace(/\s+-\s+Single$/i, "").replace(/\s+-\s+EP$/i, "");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": "BraydenMusicReleaseTracker/1.0 (personal music tracker)",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": "BraydenMusicReleaseTracker/1.0 (personal music tracker)",
      ...(options.headers || {})
    }
  });

  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function extractFeaturedArtistsFromApplePage(html) {
  const artists = new Set();

  // Public Apple Music pages expose artist links in the visible featured artists section.
  const anchorPattern = /<a[^>]+href="[^"]*\/artist\/[^"#?]+\/\d+[^"]*"[^>]*>(.*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(html)) !== null) {
    const text = normalizeName(match[1].replace(/<[^>]+>/g, ""));
    if (text && !["Search", "Home", "New", "Radio", "B"].includes(text)) artists.add(text);
  }

  // Some render paths place artist names in escaped JSON instead of plain anchors.
  const escapedPattern = /\\\/artist\\\/[^"#?]+\\\/\d+[^>]*?"name":"([^"]+)"/gi;
  while ((match = escapedPattern.exec(html)) !== null) {
    const text = normalizeName(match[1]);
    if (text) artists.add(text);
  }

  return [...artists];
}

async function scrapeArtistsFromPlaylists(playlistLinks) {
  const artists = [];

  for (const link of playlistLinks) {
    try {
      console.log(`Reading public playlist page: ${link}`);
      const html = await fetchText(link);
      const names = extractFeaturedArtistsFromApplePage(html);
      console.log(`  Found ${names.length} visible artist links.`);
      artists.push(...names);
    } catch (error) {
      console.warn(`  Could not read playlist page: ${error.message}`);
    }

    await sleep(SETTINGS.requestDelayMs);
  }

  return artists;
}

async function buildArtistList() {
  const config = await readJson(CONFIG_PATH, { playlists: [] });
  const manual = await readJson(ARTISTS_PATH, { artists: [] });
  const map = new Map();

  for (const artist of manual.artists || []) addArtist(map, artist);

  const playlistArtists = await scrapeArtistsFromPlaylists(config.playlists || []);
  for (const name of playlistArtists) addArtist(map, name);

  const artists = [...map.values()].slice(0, SETTINGS.maxArtists);
  console.log(`Tracking ${artists.length} artists total.`);
  return artists;
}

async function getItunesReleases(artist) {
  const releases = [];
  const term = encodeURIComponent(artist.name);
  const entities = ["album", "song"];

  for (const entity of entities) {
    const url = `https://itunes.apple.com/search?term=${term}&country=${SETTINGS.country}&media=music&entity=${entity}&attribute=artistTerm&limit=200`;

    try {
      const data = await fetchJson(url);
      for (const item of data.results || []) {
        const artistName = normalizeName(item.artistName);
        if (!artistName || artistKey(artistName) !== artistKey(artist.name)) continue;

        const releaseDate = item.releaseDate?.slice(0, 10);
        if (!releaseDate || !releaseIsInWindow(releaseDate)) continue;

        const rawTitle = entity === "album" ? item.collectionName : item.trackName;
        const genreTags = [item.primaryGenreName, ...(artist.genreHints || [])].filter(Boolean);
        const title = `${artist.name} — ${cleanTitle(rawTitle)}`;

        releases.push({
          id: `itunes:${item.collectionId || item.trackId}`,
          title,
          releaseDate,
          genre: inferGenre(genreTags, artist.name),
          status: getStatus(releaseDate),
          source: "iTunes Search API"
        });
      }
    } catch (error) {
      console.warn(`  iTunes ${entity} search failed for ${artist.name}: ${error.message}`);
    }

    await sleep(SETTINGS.requestDelayMs);
  }

  return releases;
}

function musicBrainzDateToIso(date) {
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  if (/^\d{4}-\d{2}$/.test(date)) return `${date}-01`;
  if (/^\d{4}$/.test(date)) return `${date}-01-01`;
  return null;
}

async function getMusicBrainzReleases(artist) {
  if (!SETTINGS.includeMusicBrainz) return [];

  const releases = [];
  const query = encodeURIComponent(`artist:"${artist.name}"`);
  const url = `https://musicbrainz.org/ws/2/release-group?query=${query}&fmt=json&limit=25`;

  try {
    const data = await fetchJson(url);
    for (const item of data["release-groups"] || []) {
      const releaseDate = musicBrainzDateToIso(item["first-release-date"]);
      if (!releaseDate || !releaseIsInWindow(releaseDate)) continue;

      const tags = [item["primary-type"], ...(item.tags || []).map((tag) => tag.name), ...(artist.genreHints || [])];
      releases.push({
        id: `musicbrainz:${item.id}`,
        title: `${artist.name} — ${cleanTitle(item.title)}`,
        releaseDate,
        genre: inferGenre(tags, artist.name),
        status: getStatus(releaseDate),
        source: "MusicBrainz"
      });
    }
  } catch (error) {
    console.warn(`  MusicBrainz search failed for ${artist.name}: ${error.message}`);
  }

  await sleep(SETTINGS.requestDelayMs);
  return releases;
}

function dedupeReleases(releases) {
  const map = new Map();

  for (const release of releases) {
    if (!release.title || !release.releaseDate) continue;
    const key = `${release.title.toLowerCase()}|${release.releaseDate}`;
    if (!map.has(key)) map.set(key, release);
  }

  return [...map.values()].sort((a, b) => {
    const dateDiff = new Date(b.releaseDate) - new Date(a.releaseDate);
    if (dateDiff !== 0) return dateDiff;
    return a.title.localeCompare(b.title);
  });
}

async function getReleasesForArtist(artist) {
  console.log(`Checking releases: ${artist.name}`);
  const releases = [];

  releases.push(...await getItunesReleases(artist));
  releases.push(...await getMusicBrainzReleases(artist));

  return dedupeReleases(releases).slice(0, SETTINGS.maxReleasesPerArtist);
}

async function main() {
  const artists = await buildArtistList();
  const allReleases = [];

  for (const artist of artists) {
    const releases = await getReleasesForArtist(artist);
    allReleases.push(...releases);
  }

  const releases = dedupeReleases(allReleases);
  const payload = {
    updatedAt: new Date().toISOString(),
    settings: {
      dataSources: ["iTunes Search API", ...(SETTINGS.includeMusicBrainz ? ["MusicBrainz"] : [])],
      country: SETTINGS.country,
      lookBackDays: SETTINGS.lookBackDays,
      lookAheadDays: SETTINGS.lookAheadDays,
      trackedArtistCount: artists.length,
      releaseCount: releases.length,
      genres: [...GENRES, "Other"]
    },
    releases
  };

  console.log(`Writing ${releases.length} releases to data/releases.json`);
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
