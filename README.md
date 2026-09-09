# Music Release Tracker — Free Version

This is a free genre-based website for tracking new and upcoming music from artists connected to your playlists.

It does **not** require:

- Apple Developer Program
- Apple Music API credentials
- Paid API keys
- Private keys
- Monthly hosting payments

## What the website shows

Each release card only shows:

- Song / Album name
- Release date
- Status: New, Upcoming, or Already Dropped

It does **not** show playlist source or Apple Music links.

## Genres

The updater automatically sorts releases into:

- Rap
- Rock
- Pop
- Metal
- Country
- Alternative
- Grunge
- R&B/Soul
- Americana
- Reggae
- Other

## How status works

The website calculates status from the release date:

- Upcoming: release date is in the future
- New: release date is today or within the last 7 days
- Already Dropped: release date is older than 7 days

## Free data sources

The daily updater uses:

1. **Public Apple Music playlist pages** to try to pull visible Featured Artists.
2. **config/artists.json** as your editable starter artist list.
3. **iTunes Search API** to look up recent albums and songs.
4. **MusicBrainz** as a backup release source.

The file that does the work is:

```text
scripts/updateReleases.js
```

## Your playlist links

Your Apple Music playlist links are saved in:

```text
config/playlists.json
```

The free updater cannot fully log into your Apple Music account. It only tries to use what is visible on the public playlist pages.

## Your artist list

Your editable artist list is here:

```text
config/artists.json
```

This is the most important file for the free version. Add artists here when you want the tracker to follow more people.

Example:

```json
{ "name": "Zach Bryan", "genreHints": ["Country", "Americana"] }
```

## Daily automatic refresh

The GitHub Actions workflow is here:

```text
.github/workflows/daily-release-check.yml
```

It is set to run every Friday morning. When it runs, it updates:

```text
data/releases.json
```

Then the website reads that updated file the next time you open it.

## Local preview

From inside the project folder:

```bash
npm start
```

Then open:

```text
http://localhost:8000
```

## Run the updater manually

From inside the project folder:

```bash
npm run update
```

This needs internet access because it calls public music data sources.

## Syntax check

```bash
npm run check
```

## Suggested free deployment

The easiest free route is:

1. Make a GitHub account if you do not already have one.
2. Create a public GitHub repository.
3. Upload every file from this folder.
4. In the repo, go to **Settings → Pages**.
5. Set GitHub Pages to serve from the main branch.
6. Go to **Actions** and enable workflows if GitHub asks.
7. Run **Daily Release Check** manually once, then let it refresh every Friday.

## Important free-version limitation

The free version is not as perfect as the paid Apple Music API version. It cannot fully sync your private/personal Apple Music playlist contents. It tracks artists from the editable artist list and any visible public playlist artist data it can find.

For a no-cost setup, this is the best realistic version: free hosting, free daily automation, and free public music data.
