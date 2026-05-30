<div align="center">

<img src="https://raw.githubusercontent.com/yoyoevoo/Splayer/main/artifacts/music-player/public/icon.png" width="80" />

# Splayer

**A free, open source desktop music player for Linux and Windows.**

Play your local music, download from YouTube, stream Spotify playlists, follow lyrics in real time, and make it look exactly how you want.

[![GitHub release](https://img.shields.io/github/v/release/yoyoevoo/Splayer?color=orange&label=Download)](https://github.com/yoyoevoo/Splayer/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows-blue)](#download)
[![License](https://img.shields.io/github/license/yoyoevoo/Splayer)](LICENSE)
[![Discord](https://img.shields.io/discord/BDQMKcGwkD?color=5865F2&label=Discord&logo=discord&logoColor=white)](https://discord.gg/BDQMKcGwkD)
[![YouTube](https://img.shields.io/badge/YouTube-@splayerrrr-FF0000?logo=youtube&logoColor=white)](https://youtube.com/@splayerrrr?si=QayfKA2C3FeMLNTz)
</div>

---

## Screenshots

![Main Player](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/1_main.png)
![Synced Lyrics](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/2_lyrics.png)
![Home & Mixes](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/11_home.png)
![YouTube Download](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/5_youtube.png)
![Format Picker](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/6_youtube_format.png)
![Quality Picker](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/7_youtube_quality.png)
![Spotify Downloader](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/8_spotify.png)
![Equalizer](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/9_eq.png)
![Reverb](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/10_reverb.png)
![Themes](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/12_themes.png)
![Custom Theme Builder](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/theme_create.png)
![Font Selection](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/fonts.png)
![Visualizer](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/visualizer.png)
![Video Player](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/15_video1.png)
![Fullscreen Video](https://raw.githubusercontent.com/yoyoevoo/Splayer/main/assets/screenshots/16_video2.png)

---

## Features

**Playback**
- Play / Pause / Next / Previous / Seek
- Shuffle, Repeat (Off / All / One)
- Crossfade, Playback speed (0.5×–2×)
- Sleep timer, configurable skip buttons
- Play Next & Play After Queue
- Auto-pause on headphone disconnect

**Audio**
- 5-Band EQ with presets (Bass Boost, Vocal, Treble, Lo-Fi)
- Reverb with decay control (Flat / Room / Hall / Cave)
- Mono mode

**Library**
- Supports MP3, FLAC, WAV, OGG, M4A, MP4, MKV, WebM and more
- Drag and drop, folder scan, bulk selection
- Metadata / ID3 tag editor, duplicate finder
- Like tracks, play count tracking, Show in Folder

**Playlists**
- Custom playlists with cover art, M3U export
- Smart playlists: Liked, Recently Played, Most Played, Never Played

**Downloads**
- Search YouTube or paste a URL / playlist link
- Choose MP3 or MP4 and pick the quality
- Import and bulk download Spotify playlists

**Audio Editor**
- Trim the start and end of any track
- Cut out a section of a song
- Merge two tracks together
- Fade In / Fade Out with adjustable duration (0–10s)
- Export to MP3, WAV, FLAC, or OGG
- Full undo / redo (Ctrl+Z)
- Original files are never modified — exports go to ~/Music/Splayer/Exports/
- Open from right-click on any track or the scissors icon in the sidebar

**Podcasts & Audiobooks**
- Subscribe via RSS or YouTube channel
- Tracks your progress per episode and chapter
- Bookmarks, notes, resumes where you left off

**Lyrics**
- Synced lyrics with seek-on-click
- Auto-fetched, with manual search as fallback

**Visuals**
- Real-time frequency visualizer
- Waveform scrubber, fullscreen visualizer
- Wallpaper with blur and opacity control
- 6 built-in themes + build your own with a custom theme editor
- Dynamic colors pulled from album art

**Other**
- Mini player, floating video player
- Customizable player buttons — hide any control you don't use
- Discord Rich Presence — shows what you're listening to automatically
- Media keys work even when minimized
- Auto-backup and restore
- MPRIS (Linux) / SMTC (Windows) OS integration

---

## Download

| Platform | File | Notes |
|----------|------|-------|
| **Linux** | `Splayer-0.2.0.AppImage` | Works on any distro, no install needed |
| **Windows** | `Splayer_Setup.exe` | Run the installer |
| **Android** | `Splayer-v0.1.0-android.apk` | Sideload — enable Unknown sources in Android settings |

👉 **[Download latest release](https://github.com/yoyoevoo/Splayer/releases/latest)**

**Linux setup:**
```bash
cd ~/Downloads
chmod +x Splayer-0.2.0.AppImage
./Splayer-0.2.0.AppImage --no-sandbox
```
> **Note:** If the app doesn't launch, the `--no-sandbox` flag fixes a common sandbox error on most Linux distros.
---

## Android

Splayer is available as a sideloadable APK. Enable **Unknown sources** in your Android settings, download the APK, and install it.
Android-only features: local music library, YouTube download, equalizer with reverb, audiobooks, visualizer, mini player.
Spotify and podcasts are desktop-only for now.

👉 **[Download latest release](https://github.com/yoyoevoo/Splayer/releases/tag/v.0.1.0.Android)**

---

## Built With

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)

---

## Community

💬 [Join the Discord](https://discord.gg/BDQMKcGwkD) — bug reports, feature requests, and general chat.

---

## Notes

- Spotify integration uses an unofficial method and may break with future Spotify updates
- Discord Rich Presence works automatically when Discord is open, no setup needed

---

## License

[MIT](LICENSE)
