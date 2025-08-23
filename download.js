#!/usr/bin/env node

const { program } = require('commander');
const { SpotifyDownloader, YoutubeDownloader } = require('./src/downloader.js');
const path = require('path');
const cliProgress = require('cli-progress');

program
  .name('music-dl')
  .description('🎵 CLI tool untuk download musik dari Spotify dan YouTube')
  .version('1.0.0')
  .argument('[url-or-query]', 'URL Spotify/YouTube atau query pencarian')
  .option('-o, --output <dir>', 'direktori output', './downloads')
  .option('-q, --quality <quality>', 'kualitas audio (0-9, 0=terbaik)', '0')
  .option('-s, --search', 'mode pencarian (force search mode)')
  .option('-l, --list', 'tampilkan daftar track tanpa download')
  .option('-v, --verbose', 'mode verbose (tampilkan info detail)')
  .option('-c, --cookies <file>', 'Path ke file cookies (misal, cookies.txt)')
  .action(async (input, options) => {
    const downloaderUI = new AdvancedDownloaderUI(options);
    await downloaderUI.handleDownload(input);
  });

program.addHelpText('after', `
Examples:
  $ music-dl "coldplay yellow"
  $ music-dl <spotify_track_url>
  $ music-dl <youtube_video_url>
  $ music-dl <youtube_playlist_url> --output ./music
  $ music-dl "adele hello" --search
  $ music-dl <spotify_playlist_url> --list
  $ music-dl <yt_age_restricted_video_url> --cookies "./cookies.txt"
  $ music-dl "imagine dragons" --quality 2

  Supported URLs:
  • Spotify: track, playlist, album
  • YouTube: video, playlist, shorts
`);

class AdvancedDownloaderUI {
  constructor(options) {
    this.options = options;
    this.spotifyDL = new SpotifyDownloader();
    this.youtubeDL = new YoutubeDownloader(options.output);
  }
  async handleDownload(input) {
    if (!input) return program.help();
    console.log(`🔍 Processing: ${input}`);
    try {
      if (this.options.list) {
        await this.handleListOnly(input);
        return;
      }
      const isCollection = (input.includes('playlist') || input.includes('album') || input.includes('list='));
      if (isCollection) {
        await this.handleCollectionDownload(input);
      } else {
        await this.handleSingleDownload(input);
      }
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      if (this.options.verbose) {
        console.error('Stack:', error.stack);
      }
      process.exit(1);
    }
  }
  async handleSingleDownload(input) {
    const bar = new cliProgress.SingleBar({ format: ' {bar} | {percentage}% | {filename}' }, cliProgress.Presets.shades_classic);
    console.log('');
    bar.start(100, 0, { filename: "Getting metadata..." });
    const checkpoints = [10, 30, 50, 60, 75, 95, 100];
    let lastCheckpoint = 0;
    const options = {
      onProgress: (percent) => {
        const nextCheckpoint = checkpoints.find(c => c > lastCheckpoint);
        if (nextCheckpoint && percent >= nextCheckpoint) {
          bar.update(nextCheckpoint);
          lastCheckpoint = nextCheckpoint;
        }
      },
      onSingleStart: (meta) => {
        bar.update(0, { filename: `${meta.artist} - ${meta.title}`.substring(0, 50).trim() });
        lastCheckpoint = 0;
      }
    };
    let filePath;
    try {
      if (this.options.search || (!input.includes('http') && !input.includes('www'))) {
        filePath = await this.youtubeDL.searchAndDownload(input, this.options.output, this.options.cookies, this.options.quality, options);
      } else if (input.includes('spotify.com')) { // Deteksi lebih baik
        const files = await this.spotifyDL.downloadTrackOrCollection(input, this.options.output, this.options.cookies, this.options.quality, options);
        filePath = files[0];
      } else {
        filePath = await this.youtubeDL.download(input, null, this.options.output, this.options.cookies, this.options.quality, options);
      }
      bar.update(100);
      bar.stop();
      this.printResults([filePath], "Single file");
    } catch (error) {
      bar.stop();
      throw error;
    }
  }
  async handleCollectionDownload(input) {
    const multibar = new cliProgress.MultiBar({
      clearOnComplete: false, hideCursor: true, format: ' {bar} | {filename} | {progress}%'
    }, cliProgress.Presets.shades_classic);
    let mainBar;
    const checkpoints = [10, 30, 50, 60, 75, 95, 100];
    let trackProgressState = {};
    const options = {
      onCollectionStart: (tracks) => {
        console.log(`\nStarting download for ${tracks.length} tracks...`);
        mainBar = multibar.create(tracks.length, 0, { filename: 'TOTAL PROGRESS', progress: 0 });
      },
      onTrackStart: (track, current, total) => {
        const filename = (track.title || "Unknown").substring(0, 40);
        const trackId = track.id || track.title;
        trackProgressState[trackId] = {
          bar: multibar.create(100, 0, { filename: `[${current}/${total}] ${filename}`, progress: 0 }),
          lastCheckpoint: 0
        };
      },
      onTrackProgress: (track, percent) => {
        const trackId = track.id || track.title;
        const state = trackProgressState[trackId];
        if (state) {
          const nextCheckpoint = checkpoints.find(c => c > state.lastCheckpoint);
          if (nextCheckpoint && percent >= nextCheckpoint) {
            state.bar.update(nextCheckpoint, { progress: nextCheckpoint });
            state.lastCheckpoint = nextCheckpoint;
            if (nextCheckpoint === 100 && mainBar) {
              mainBar.increment();
            }
          }
        }
      },
      onTrackError: (track, error) => {
        const trackId = track.id || track.title;
        const state = trackProgressState[trackId];
        if (state && state.bar) {
          multibar.remove(state.bar);
        }
        if (mainBar) mainBar.increment();
        console.error(`\n[ERROR] Failed to download ${track.title}: ${error.message}`);
      },
    };
    let files;
    try {
      if (input.includes('spotify.com')) {
        files = await this.spotifyDL.downloadTrackOrCollection(input, this.options.output, this.options.cookies, this.options.quality, options);
      } else {
        files = await this.youtubeDL.downloadCollection(input, this.options.output, this.options.cookies, this.options.quality, options);
      }
      if (mainBar) mainBar.update(mainBar.getTotal());
      multibar.stop();
      this.printResults(files, "Collection");
    } catch (error) {
      multibar.stop();
      throw error;
    }
  }
  async handleListOnly(input) {
    try {
      if (input.includes('spotify.com/playlist/')) {
        const playlistId = input.match(/playlist\/([a-zA-Z0-9]+)/)[1];
        const token = await this.spotifyDL.getAccessToken();
        const tracks = await this.spotifyDL.getTracksFromPlaylist(playlistId, token);
        console.log(`\n📋 Spotify Playlist (${tracks.length} tracks):`);
        tracks.forEach((track, index) => {
          console.log(`${index + 1}. ${track.artist} - ${track.title}`);
        });
      } else if (input.includes('spotify.com/album/')) {
        const albumId = input.match(/album\/([a-zA-Z0-9]+)/)[1];
        const token = await this.spotifyDL.getAccessToken();
        const tracks = await this.spotifyDL.getTracksFromAlbum(albumId, token);
        console.log(`\n📀 Spotify Album (${tracks.length} tracks):`);
        tracks.forEach((track, index) => {
          console.log(`${index + 1}. ${track.artist} - ${track.title}`);
        });
      } else {
        console.log('❌ List mode hanya support Spotify playlist/album untuk sekarang');
      }
    } catch (e) {
      console.error(`\n❌ Error fetching list: ${e.message}`);
    }
  }
  printResults(files, source) {
    console.log('\n' + '='.repeat(50));
    if (!files || files.length === 0) {
      console.log(`🟡 No files were downloaded from ${source}.`);
    } else if (files.length === 1 && files[0]) {
      console.log(`✅ ${source} download completed:`);
      console.log(`   📁 ${path.basename(files[0])}`);
      console.log(`   📂 Location: ${path.dirname(files[0])}`);
    } else {
      console.log(`✅ Downloaded ${files.filter(f => f).length} files from ${source}:`);
      files.forEach((file, index) => {
        if (file) console.log(`   ${index + 1}. ${path.basename(file)}`);
      });
      if (files.length > 0 && files.filter(f => f)[0]) {
        console.log(`   📂 Location: ${path.dirname(files.filter(f => f)[0])}`);
      }
    }
    console.log('='.repeat(50));
  }
}
program.showHelpAfterError('(add --help untuk informasi lebih lanjut)');
program.parse();