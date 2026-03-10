# Kechimochi

<p align="center">
  <img src="public/logo.png" width="120" alt="Kechimochi Logo" />
</p>

<p align="center">
  <em>A personal language immersion tracker</em>
</p>

---

> [!CAUTION]
> **WARNING: VIBE-CODED SOFTWARE: USE AT YOUR OWN RISK**
>
> This application was **entirely vibe-coded**. That means it was built rapidly with AI assistance,
> without formal testing, code review, or quality assurance processes. There are certainly bugs
> lurking in the codebase, edge cases that haven't been considered, and potentially data-loss
> scenarios that haven't been accounted for.
>
> **The author takes absolutely no responsibility for:**
>
> - Data loss, corruption, or inaccuracy
> - Application crashes or unexpected behavior
> - Any consequences resulting from reliance on this software
> - Security vulnerabilities
> - Anything else that might go wrong
>
> **You have been warned.** Back up your data frequently. Use the CSV export feature.
> Do not rely on this application as your sole source of truth for anything important.

---

## What is Kechimochi?

Kechimochi is a **desktop activity tracker** designed for people studying languages through immersion. It helps you log, visualize, and analyze time spent consuming media in your target language, whether you're reading manga, watching anime, playing games, or listening to podcasts.

## Features

### Dashboard

- **Tracking Heatmap**: A GitHub style yearly contribution heatmap showing your daily activity. Navigate between years to view your historical immersion journey.
- **Study Stats**: A statistics panel providing insights into your habits:
  - Total lifetime logs and media entries.
  - Longest consecutive study streak and current active streak.
  - Daily averages: total and per activity type.
  - Date of first recorded entry.
- **Activity Breakdown**: A doughnut chart visualizing time distribution across activity types such as Reading, Watching, or Playing.
- **Activity Visualization**: Bar or line charts showing immersion over time with configurable ranges:
  - **Weekly**: Day by day breakdown.
  - **Monthly**: Week by week breakdown.
  - **Yearly**: Month by month breakdown.
- **Recent Activity**: A timeline feed of your latest logged sessions with the ability to delete individual entries.

### Library and Media Management

- **Media Grid**: A grid view to track your media titles.
- **Power Search**: Real time fuzzy search
- **Advanced Filtering**: Filter your library by activity type, status, or immersion category (Reading/Listening/Playing)
- **Sorting**: Sort library by Recent, Title, Time, Characters Read, Reading Speed, or Finished Date with ascending/descending toggle
- **Hidden Entries**: Auto-hides entries with no cover and non-Ongoing status; manually hide/unhide via right-click context menu
- **Media Details**: A comprehensive view for each title including:
  - **Metadata Management**: Edit titles, descriptions, and custom fields.
  - **Contextual Tagging**: Smart content types tailored to the activity type.
  - **Progress Tracking**: Update statuses like Ongoing, Complete, Dropped, etc.
  - **Personal Stats**: Total characters read, total time, reading speed (文字/hour), first and last activity dates.
  - **NSFW Toggle**: Mark entries as NSFW with blur-on-hover in the grid.

### Metadata Importers

Automatically fetch covers, descriptions, and metadata from various sources:

- **Visual Novels**: VNDB
- **Manga and Books**: Bookmeter, BookWalker, Cmoa, Shonen Jump Plus
- **Anime and Movies**: AniList, IMDb
- **Video Games**: Backloggd
  With Jiten.moe metadata integration

### Multi-Profile and Personalization

- **Isolated Profiles**: Create and switch between multiple user profiles, each with its own independent SQLite database.
- **Theme System**: Choose from 12 curated themes including Light, Dark, Pastel Pink, Molokai, Noctua Brown, and multiple greyscale options.

### Data Management

- **Activity Portability**: Import or export activity logs in CSV format.
- **Library Portability**: Export your entire media library to CSV or import new libraries from other users or backups.

## Prerequisites

- **Node.js** >= 18
- **Rust** (latest stable, via [rustup](https://rustup.rs/))
- **System dependencies** for Tauri on Linux:

```bash
# Debian/Ubuntu
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel

# Arch
sudo pacman -S webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg
```

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/Morgawr/kechimochi.git
cd kechimochi
npm install
```

### 2. Run in development mode

```bash
npm run tauri dev
```

This will:

- Start the Vite dev server for hot-reloading the frontend
- Compile and launch the Rust backend
- Open the application window

### 3. Build a standalone binary

```bash
# On Arch Linux (or if AppImage build fails with strip errors)
NO_STRIP=true npx tauri build

# On Debian/Ubuntu/Fedora
npx tauri build
```

The compiled binary and packages will be at:

```
src-tauri/target/release/kechimochi              # raw binary
src-tauri/target/release/bundle/appimage/         # .AppImage (portable)
src-tauri/target/release/bundle/deb/              # .deb (Debian/Ubuntu)
```

You can run the AppImage directly:

```bash
chmod +x src-tauri/target/release/bundle/appimage/kechimochi_*.AppImage
./src-tauri/target/release/bundle/appimage/kechimochi_*.AppImage
```

Or just run the raw binary:

```bash
./src-tauri/target/release/kechimochi
```

> [!NOTE]
> On Arch Linux, `linuxdeploy`'s bundled `strip` tool is incompatible with Arch's newer ELF
> format. Setting `NO_STRIP=true` skips the stripping step and resolves the issue. The resulting
> AppImage will be slightly larger but functionally identical.

### 4. Running Tests

The application includes a comprehensive Rust test suite to verify the database operations, aggregation logic, and CSV imports.

To run the testing suite:

```bash
cd src-tauri
cargo test
```

To run TypeScript frontend type checking:

```bash
npx tsc --noEmit
```

## CSV Format

For importing data, use the following CSV format:

```csv
Date,Log Name,Media Type,Characters Read,Duration
2024-01-15,ある魔女が死ぬまで,Reading,15000,45
2024-01-15,Final Fantasy 7,Playing,,120
2024-01-16,呪術廻戦,Listening,,25
```

| Column            | Description                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Date`            | `YYYY-MM-DD` format                                                                                                              |
| `Log Name`        | Title of the media                                                                                                               |
| `Media Type`      | Content type (e.g. `Visual Novel`, `Manga`, `Anime`, `Book`, `Light Novel`, `JRPG`, `Audiobook`, `Podcast`, `JDrama`, `Youtube`) |
| `Characters Read` | Number of characters read (required for Reading types; supports comma-formatted numbers like `15,000`)                           |
| `Duration`        | Duration in minutes (integer) or `HH:MM:SS` / `MM:SS` format                                                                     |

## Data Storage

All data is stored locally in SQLite databases in your system's application data directory:

- **Linux**: `~/.local/share/com.morg.kechimochi/`
- **macOS**: `~/Library/Application Support/com.morg.kechimochi/`
- **Windows**: `C:\Users\<user>\AppData\Roaming\com.morg.kechimochi\`

Each profile has its own database file named `kechimochi_<profilename>.db`.

## License

This project is provided as-is with no warranty. See the warning at the top of this document.

## Changes from Main

### Media Classification Rework

Media entries are now classified by specific media types instead of broad categories like Reading or Watching. Each media type maps to an internal activity classification:

| Media Type   | Classification |
| ------------ | -------------- |
| Anime        | Listening      |
| Manga        | Reading        |
| Light Novel  | Reading        |
| Visual Novel | Reading        |
| Book         | Reading        |
| Audiobook    | Listening      |
| Podcast      | Listening      |
| JDrama       | Listening      |
| Youtube      | Listening      |
| JRPG         | Playing        |

### Character Count Metrics

Activity log imports now accept a character count field. Character metrics are stored per media entry and displayed in the media detail stats row, including total characters read and reading speed (文字/hour).

### Time Format

Durations are now accepted in `HH:MM:SS`, `MM:SS`, or plain minutes. The `parseDuration()` function handles the conversion internally, and all times are displayed in `HH:MM:SS` format via `formatDuration()`.

### Language Field Removed

The language selector has been removed from the activity log modal. All entries default to 日本語.

### New Dashboard Graphs

Three additional charts appear below the existing graphs:

- **Cumulative Hours** — An area chart showing total hours accumulated over time.
- **Activity by Day of Week** — A radar chart displaying minutes logged per weekday for the current week.
- **Reading Speed Over Time** — A line chart plotting weekly average 文字/hour with detailed tooltips (sessions, total characters, total time, speed range).

### Heatmap Tooltips

Hovering over a box in the tracking heatmap displays a tooltip listing all media entries logged on that day with their individual durations.

### Chart Interaction Improvements

- The Activity Breakdown and Characters Read doughnut charts each have a toggle button to switch between grouping by media type and by individual media entry.
- The chart type, time range, and grouping dropdowns on the Activity Visualization chart have been replaced with cycling buttons that rotate through options on click.

### NSFW Blur

Media entries can be marked as NSFW. Toggling NSFW blurs the cover art in both the library grid and the media detail page. In the library grid, hovering temporarily reveals the image. In the media detail page, right-clicking the cover toggles the blur.

### Hidden Entries

Media entries can be hidden from the library grid via a right-click context menu. Entries are also automatically hidden if they have no cover art and their status is not Ongoing. Hidden entries can be viewed in a collapsible section at the bottom of the library.

### Library Sort and Filter

The library view now includes sort and filter controls:

- **Sort by**: Recent, Title, Time, Characters Read, Reading Speed, or Finished Date (ascending/descending).
- **Filter by**: Media type, status, or immersion category (Reading/Listening/Playing).

### Media Detail Stats Row

Each media entry's detail page displays computed statistics: total characters read, total time, reading speed (文字/hour), and first/last activity dates.

### Total Hours on Dashboard

A total lifetime hours label is displayed in the stats card on the dashboard.
