const axios = require("axios");
const yts = require("yt-search");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

function sanitizeFilename(name) {
  const sanitized = name.replace(/[^a-zA-Z0-9\s\-_.,()]/g, '_');
  return sanitized.replace(/\s+/g, ' ').trim();
}
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function rmSafe(p) {
  try {
    if (!p) return;
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  } catch (_) {}
}
function unlinkSafe(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
}
function makeTempWorkDirFor(outputPath, suffix = "tmp") {
  const baseDir = path.dirname(path.resolve(outputPath));
  const baseName = path.basename(outputPath);
  const tempDir = path.join(baseDir, `.${baseName}.${suffix}_${Date.now()}`);
  ensureDir(tempDir);
  return tempDir;
}
function sweepLeftovers(finalDir, finalBasenameNoExt, keepExts = []) {
  const extsToRemove = new Set([
    ".webm", ".m4a", ".mkv", ".mpd", ".m3u8", ".part",
    ".ytdl", ".ytdl.tmp", ".f234", ".f140", ".frag",
    ".opus", ".temp"
  ]);
  for (const ext of keepExts) extsToRemove.delete(ext.toLowerCase());
  try {
    const files = fs.readdirSync(finalDir);
    for (const f of files) {
      const full = path.join(finalDir, f);
      const lower = f.toLowerCase();
      const ext = path.extname(lower);
      const isTrashExt = extsToRemove.has(ext);
      const isTempPattern = (lower.endsWith(".temp.mp4") || lower.endsWith(".temp.m4a") || lower.includes("fragment") || lower.includes("ytdl"));
      const isFinal = keepExts.includes(ext) && lower.startsWith(finalBasenameNoExt.toLowerCase());
      if ((isTrashExt || isTempPattern) && !isFinal) {
        unlinkSafe(full);
      }
    }
  } catch (_) {}
}
function sweepGlobalLeftovers(baseDirs = [process.cwd()]) {
  for (const dir of baseDirs) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            if (item.startsWith("ALL")) {
              console.warn(`[Cleanup] Menghapus folder sementara yang bocor: ${item}`);
              rmSafe(fullPath);
            }
          } else {
            const ext = path.extname(item).toLowerCase();
            if ([".webm", ".mp4", ".mp3", ".m4a", ".mkv", ".mpd", ".m3u8", ".part", ".ytdl", ".ytdl.tmp", ".f234", ".f140", ".frag", ".opus", ".temp"].includes(ext)) {
              unlinkSafe(fullPath);
            }
          }
        } catch (e) {}
      }
    } catch (_) {}
  }
}
function run(cmd, args, { cwd, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: false });
    const progressRegex = /\[download\]\s+([0-9.]+)%/;
    const handleChunk = (buf) => {
      const out = buf.toString();
      const m = out.match(progressRegex);
      if (m && m[1] && onProgress) onProgress(parseFloat(m[1]));
    };
    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function executeAudioDownload(ytDlpCommand, url, outputPath, quality, cookiesPath, onProgress) {
  const finalOutAbs = path.resolve(outputPath);
  ensureDir(path.dirname(finalOutAbs));
  const tempDir = makeTempWorkDirFor(finalOutAbs, "audiowork");
  const tempPattern = path.join(tempDir, "temp_%(id)s.%(ext)s");
  const finalDir = path.dirname(finalOutAbs);
  try {
    const ytArgs = [
      "-f", "bestaudio/best",
      "--no-cache-dir",
      "--rm-cache-dir",
      "-o", tempPattern,
      "--paths", `ALL:${tempDir}`,
      url
    ];
    if (cookiesPath) ytArgs.push("--cookies", cookiesPath);
    await run(ytDlpCommand, ytArgs, {
      onProgress: (p) => onProgress?.(Math.max(0, Math.min(50, p / 2)))
    });
    const tempFiles = fs.readdirSync(tempDir)
      .filter(f => /\.(webm|m4a|mp3|opus|aac|wav|flac)$/i.test(f))
      .map(f => ({ f, size: fs.statSync(path.join(tempDir, f)).size }))
      .sort((a, b) => b.size - a.size);
    if (tempFiles.length === 0) throw new Error("File audio sementara tidak ditemukan.");
    const inputRaw = path.join(tempDir, tempFiles[0].f);
    const qualityArg = isNaN(parseInt(quality, 10)) ? "0" : String(quality);
    const ffArgs = ["-y", "-i", inputRaw, "-vn", "-acodec", "libmp3lame", "-q:a", qualityArg, finalOutAbs];
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", ffArgs);
      ff.stderr.on("data", () => onProgress?.(Math.min(99, 100)));
      ff.on("error", reject);
      ff.on("close", (code) => {
        if (code === 0) {
          onProgress?.(100);
          resolve();
        } else {
          reject(new Error(`ffmpeg gagal`));
        }
      });
    });
  } finally {
    rmSafe(tempDir);
    const baseNoExt = path.basename(finalOutAbs, path.extname(finalOutAbs));
    sweepLeftovers(finalDir, baseNoExt, [".mp3"]);
    sweepGlobalLeftovers();
  }
}

class SpotifyDownloader {
  constructor() {
    this.client_id = process.env.SPOTIFY_CLIENT_ID || "acc6302297e040aeb6e4ac1fbdfd62c3";
    this.client_secret = process.env.SPOTIFY_CLIENT_SECRET || "0e8439a1280a43aba9a5bc0a16f3f009";
    this.rateLimitDelay = 500;
    const localYtDlp = path.resolve(process.cwd(), 'venv', 'bin', 'yt-dlp');
    this.ytDlpCommand = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
  }
  async getAccessToken() {
    const basic = Buffer.from(`${this.client_id}:${this.client_secret}`).toString("base64");
    const response = await axios.post("https://accounts.spotify.com/api/token", "grant_type=client_credentials", {
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    });
    return response.data.access_token;
  }
  async getTrackMetadata(trackId, token) {
    const res = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { title: res.data.name, artist: res.data.artists.map((a) => a.name).join(", ") };
  }
  async getTracksFromPlaylist(playlistId, token) {
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
    let tracks = [];
    while (url) {
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      tracks.push(...res.data.items.map((item) => (item.track ? {
        id: item.track.id,
        title: item.track.name,
        artist: item.track.artists.map((a) => a.name).join(", "),
      } : null)).filter(Boolean));
      url = res.data.next;
    }
    return tracks;
  }
  async getTracksFromAlbum(albumId, token) {
    let url = `https://api.spotify.com/v1/albums/${albumId}/tracks`;
    let tracks = [];
    while (url) {
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      tracks.push(...res.data.items.map((item) => ({
        id: item.id,
        title: item.name,
        artist: item.artists.map((a) => a.name).join(", "),
      })));
      url = res.data.next;
    }
    return tracks;
  }
  async search(query) {
    try {
      const access_token = await this.getAccessToken();
      const response = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      return response.data.tracks.items.map(item => ({
        id: item.id,
        name: item.name,
        artists: item.artists.map((artist) => artist.name).join(", "),
        album: item.album.name,
        link: item.external_urls.spotify,
        duration_ms: item.duration_ms,
      }));
    } catch (error) {
      throw new Error("An error occurred while searching Spotify.");
    }
  }
  async searchYoutube(query) {
    try {
      const result = await yts(query);
      return result.videos.length > 0 ? result.videos[0].url : null;
    } catch (error) {
      return null;
    }
  }
  async downloadFromYoutube(url, metadata, customDir, cookiesPath, quality, options = {}) {
    const safeName = sanitizeFilename(`${metadata.artist} - ${metadata.title}`);
    const outputDir = path.resolve(customDir);
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${safeName}.mp3`);
    await executeAudioDownload(
      this.ytDlpCommand,
      url,
      outputPath,
      quality,
      cookiesPath,
      options.onProgress
    );
    return outputPath;
  }
  async downloadTrackOrCollection(spotifyUrl, outDir, cookiesPath, quality, options = {}) {
    const token = await this.getAccessToken();
    const isSingleTrack = /track/.test(spotifyUrl) && !spotifyUrl.includes('playlist') && !spotifyUrl.includes('album');
    if (isSingleTrack) {
      const trackId = spotifyUrl.match(/track\/([a-zA-Z0-9]+)/)[1];
      const meta = await this.getTrackMetadata(trackId, token);
      if (options.onSingleStart) options.onSingleStart(meta);
      const ytUrl = await this.searchYoutube(`${meta.title} ${meta.artist}`);
      if (!ytUrl) throw new Error("Gagal menemukan video di YouTube!");
      const finalOutDir = outDir || "./src/sampah";
      return [await this.downloadFromYoutube(ytUrl, meta, finalOutDir, cookiesPath, quality, options)];
    }
    const isPlaylist = spotifyUrl.includes('/playlist/');
    const id = spotifyUrl.match(/\/(?:playlist|album)\/([a-zA-Z0-9]+)/)[1];
    const tracks = isPlaylist ? await this.getTracksFromPlaylist(id, token) : await this.getTracksFromAlbum(id, token);
    if (options.onCollectionStart) options.onCollectionStart(tracks);
    const downloadedFiles = [];
    for (const [index, track] of tracks.entries()) {
      try {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        if (options.onTrackStart) options.onTrackStart(track, index + 1, tracks.length);
        const ytUrl = await this.searchYoutube(`${track.title} ${track.artist}`);
        if (ytUrl) {
          const finalOutDir = outDir || "./src/sampah";
          const filePath = await this.downloadFromYoutube(ytUrl, track, finalOutDir, cookiesPath, quality, {
            onProgress: (percent) => {
              if (options.onTrackProgress) options.onTrackProgress(track, percent);
            }
          });
          downloadedFiles.push(filePath);
        } else {
          if (options.onTrackError) options.onTrackError(track, new Error("No YouTube video found."));
        }
      } catch (error) {
        if (options.onTrackError) options.onTrackError(track, error);
      }
    }
    return downloadedFiles;
  }
}

class YoutubeDownloader {
  constructor(defaultDir = "./src/sampah") {
    this.defaultDir = defaultDir;
    fs.mkdirSync(path.resolve(this.defaultDir), { recursive: true });
    const localYtDlp = path.resolve(process.cwd(), 'venv', 'bin', 'yt-dlp');
    this.ytDlpCommand = fs.existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
    this.rateLimitDelay = 500;
  }
  async getVideoMetadata(url, cookiesPath = null) {
    return new Promise((resolve, reject) => {
      const args = ['--print-json', '--no-warnings', url];
      if (cookiesPath) { args.unshift(cookiesPath); args.unshift('--cookies'); }
      const process = spawn(this.ytDlpCommand, args);
      let metadataJson = '';
      let errorOutput = '';
      process.stdout.on('data', (chunk) => metadataJson += chunk);
      process.stderr.on('data', (chunk) => errorOutput += chunk);
      process.on('close', (code) => {
        if (code === 0 && metadataJson) {
          try {
            const metadata = JSON.parse(metadataJson);
            let artist = metadata.artist || metadata.uploader || "Unknown Artist";
            let title = metadata.title || "Unknown Title";
            artist = artist.replace(/ - Topic$/, '').replace(/ Official$/, '').replace(/VEVO$/, '').trim();
            const artistRegex = new RegExp(`^${artist}\\s*-\\s*`, 'i');
            title = title.replace(artistRegex, '').replace(/\(Official (Video|Music Video|Audio)\)/gi, '').replace(/\[Official (Video|Audio)\]/gi, '').replace(/\((Audio|Lyrics|Visualizer)\)/gi, '').trim();
            resolve({ filename: sanitizeFilename(`${artist} - ${title}`) });
          } catch (e) { reject(e); }
        } else { reject(new Error(`Gagal mendapatkan metadata: ${errorOutput}`)); }
      });
      process.on('error', reject);
    });
  }
  async download(url, filename, customDir, cookiesPath, quality, options = {}) {
    const finalDir = customDir || this.defaultDir;
    let finalFilename = filename;
    if (!finalFilename) {
      const metadata = await this.getVideoMetadata(url, cookiesPath);
      finalFilename = metadata.filename;
    }
    if (options.onSingleStart) options.onSingleStart({ artist: '', title: finalFilename });
    const outputPath = path.join(path.resolve(finalDir), `${sanitizeFilename(finalFilename)}.mp3`);
    await executeAudioDownload(
      this.ytDlpCommand,
      url,
      outputPath,
      quality,
      cookiesPath,
      options.onProgress
    );
    return outputPath;
  }
  async downloadCollection(url, customDir, cookiesPath, quality, options = {}) {
    const finalDir = customDir || this.defaultDir;
    const listArgs = ['--flat-playlist', '--print-json', url];
    if (cookiesPath) { listArgs.unshift(cookiesPath); listArgs.unshift('--cookies'); }
    const listProcess = spawn(this.ytDlpCommand, listArgs);
    let videoListJson = '';
    for await (const chunk of listProcess.stdout) { videoListJson += chunk; }
    const videos = videoListJson.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    if (options.onCollectionStart) options.onCollectionStart(videos);
    const downloadedFiles = [];
    for (const [index, video] of videos.entries()) {
      const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;
      try {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        if (options.onTrackStart) options.onTrackStart(video, index + 1, videos.length);
        const filePath = await this.download(videoUrl, null, finalDir, cookiesPath, quality, {
          onProgress: (percent) => {
            if (options.onTrackProgress) options.onTrackProgress(video, percent);
          },
          onSingleStart: (meta) => {}
        });
        downloadedFiles.push(filePath);
      } catch (error) {
        if (options.onTrackError) options.onTrackError(video, error);
      }
    }
    return downloadedFiles;
  }
  async searchAndDownload(query, customDir, cookiesPath, quality, options = {}) {
    const searchResults = await yts(query);
    if (searchResults.videos.length === 0) {
      throw new Error("Tidak ditemukan hasil untuk query: " + query);
    }
    const videoUrl = searchResults.videos[0].url;
    return await this.download(videoUrl, null, customDir, cookiesPath, quality, options);
  }
  async downloadVideo(url, downloadOptions = {}) {
    const {
      filename = null,
      customDir = this.defaultDir,
      cookiesPath = null,
      resolution = null,
      onProgress = null,
    } = downloadOptions;
    let finalFilename = filename;
    let outputPath;
    try {
      if (!finalFilename) {
        const metadata = await this.getVideoMetadata(url, cookiesPath);
        finalFilename = metadata.filename;
      }
      outputPath = path.join(path.resolve(customDir), `${sanitizeFilename(finalFilename)}.mp4`);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      let formatString;
      if (resolution) {
        const checkArgs = ['-F', url];
        if (cookiesPath) { checkArgs.unshift(cookiesPath); checkArgs.unshift('--cookies'); }
        const formatsOutput = await new Promise((resolve, reject) => {
          const process = spawn(this.ytDlpCommand, checkArgs);
          let stdout = '';
          let stderr = '';
          process.stdout.on('data', (chunk) => stdout += chunk);
          process.stderr.on('data', (chunk) => stderr += chunk);
          process.on('error', reject);
          process.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`Gagal memeriksa format. Error: ${stderr}`)));
        });
        const lines = formatsOutput.split('\n');
        let foundFormatId = null;
        for (const line of lines.reverse()) {
          if (line.includes(resolution.replace('p', '')) && line.includes('mp4')) {
            foundFormatId = line.trim().split(/\s+/)[0];
            break;
          }
        }
        if (foundFormatId) {
          formatString = `${foundFormatId}+bestaudio[ext=m4a]/best`;
        } else {
          const availableResolutions = lines
            .map(line => line.match(/\s(\d{3,5}x\d{3,5})\s/))
            .filter(match => match)
            .map(match => match[1].split('x')[1] + 'p')
            .filter((value, index, self) => self.indexOf(value) === index)
            .join(', ');
          throw new Error(`🚫 Resolusi '${resolution}' tidak tersedia.\nResolusi yang ada: ${availableResolutions || 'Tidak ada data.'}`);
        }
      } else {
        formatString = `bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`;
      }
      const ytDlpArgs = ['-f', formatString, '--merge-output-format', 'mp4', '-o', outputPath, url];
      if (cookiesPath) {
        ytDlpArgs.unshift(cookiesPath);
        ytDlpArgs.unshift('--cookies');
      }
      return new Promise((resolve, reject) => {
        const process = spawn(this.ytDlpCommand, ytDlpArgs);
        const progressRegex = /\[download\]\s+([0-9.]+)%/;
        let errorOutput = '';
        if (onProgress) onProgress(0);
        process.stdout.on('data', (data) => {
          const output = data.toString();
          const match = output.match(progressRegex);
          if (match && match[1]) {
            if (onProgress) onProgress(parseFloat(match[1]));
          }
        });
        process.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        process.on('error', reject);
        process.on('close', (code) => {
          if (code === 0) {
            if (onProgress) onProgress(100);
            resolve(outputPath);
          } else {
            reject(new Error(`Proses unduh video gagal dengan kode ${code}. Error: ${errorOutput}`));
          }
        });
      });
    } finally {
      if (outputPath && finalFilename) {
        console.log('\n[Cleanup] Menjalankan pembersihan untuk unduhan video...');
        const finalDir = path.dirname(outputPath);
        const finalBasenameNoExt = sanitizeFilename(finalFilename);
        sweepLeftovers(finalDir, finalBasenameNoExt, ['.mp4']);
        sweepGlobalLeftovers([finalDir, process.cwd()]);
      }
    }
  }
  async searchVideos(query, limit = 5) {
    try {
      const searchResults = await yts(query);
      return searchResults.videos.slice(0, limit);
    } catch (error) {
      console.error("Error searching YouTube:", error.message);
      throw new Error("Gagal melakukan pencarian di YouTube.");
    }
  }
}

module.exports = { SpotifyDownloader, YoutubeDownloader };