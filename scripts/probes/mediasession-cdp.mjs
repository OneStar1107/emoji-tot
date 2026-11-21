#!/usr/bin/env node
/**
 * MediaSession probe - the page half of docs/LIVE-COVERAGE.md.
 *
 * A Chromium page publishes what it plays through the MediaSession API. Chrome
 * forwards that into the Windows SMTC session, which is what the island reads.
 * This script asks each site the question the island cannot: is there
 * MediaSession metadata, does it carry artwork, and how many bytes is that
 * artwork.
 *
 * It drives a real Chromium over the DevTools protocol. Node >= 22 has a global
 * WebSocket, so there is nothing to install:
 *
 *   node scripts/probes/mediasession-cdp.mjs
 *   node scripts/probes/mediasession-cdp.mjs --only bilibili
 *   node scripts/probes/mediasession-cdp.mjs --browser "C:/.../msedge.exe"
 *   node scripts/probes/mediasession-cdp.mjs --out probe.json --settle 6000
 *
 * Pages load in a throwaway profile, muted, with autoplay allowed so the player
 * reaches its now-playing state without a click. Nothing is logged in: a site
 * that needs an account reports what a fresh install sees, which is also what
 * the island sees.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const ONLY = flag("only", "");
const ADHOC = flag("url", "");
const SETTLE = Number(flag("settle", 4000));
const NAV_TIMEOUT = Number(flag("timeout", 20000));
const OUT = flag("out", "");
const HEADFUL = argv.includes("--headful");

/** Sites a Windows user actually plays live or on demand through. */
const TARGETS = [
  { id: "bilibili-live", name: "哔哩哔哩直播", url: "https://live.bilibili.com/" },
  { id: "bilibili-video", name: "哔哩哔哩视频", url: "https://www.bilibili.com/video/BV1GJ411x7h7" },
  { id: "douyu", name: "斗鱼", url: "https://www.douyu.com/" },
  { id: "huya", name: "虎牙", url: "https://www.huya.com/" },
  { id: "douyin-live", name: "抖音直播", url: "https://live.douyin.com/" },
  { id: "kuaishou-live", name: "快手直播", url: "https://live.kuaishou.com/" },
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" },
  { id: "twitch", name: "Twitch", url: "https://www.twitch.tv/" },
  { id: "netflix", name: "Netflix", url: "https://www.netflix.com/" },
  { id: "qqmusic", name: "QQ音乐", url: "https://y.qq.com/" },
  { id: "netease", name: "网易云音乐", url: "https://music.163.com/" },
  { id: "kugou", name: "酷狗音乐", url: "https://www.kugou.com/" },
  { id: "spotify", name: "Spotify", url: "https://open.spotify.com/" },
  { id: "applemusic", name: "Apple Music", url: "https://music.apple.com/" },
];

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

function findBrowser() {
  const explicit = flag("browser", "");
  if (explicit) return existsSync(explicit) ? explicit : null;
  return BROWSERS.find((candidate) => existsSync(candidate)) ?? null;
}

/** Runs inside the page. Serialized with toString, so no template quoting. */
function pageProbe() {
  const ms = navigator.mediaSession;
  const md = ms && ms.metadata;
  const artwork = md && md.artwork ? Array.from(md.artwork).map((item) => ({
    src: String(item.src || ""),
    sizes: String(item.sizes || ""),
    type: String(item.type || ""),
  })) : [];
  const videos = Array.from(document.querySelectorAll("video")).map((v) => ({
    src: String(v.currentSrc || v.src || "").slice(0, 160),
    paused: !!v.paused,
    ready: v.readyState,
    w: v.videoWidth,
    h: v.videoHeight,
    t: Math.round((v.currentTime || 0) * 10) / 10,
  }));
  return {
    href: location.href,
    pageTitle: document.title,
    hasMediaSession: !!ms,
    metadata: md ? {
      title: String(md.title || ""),
      artist: String(md.artist || ""),
      album: String(md.album || ""),
      artwork,
    } : null,
    videos,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal CDP client over one WebSocket. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const slot = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) slot.reject(new Error(message.error.message));
        else slot.resolve(message.result);
        return;
      }
      const list = this.listeners.get(message.method) || [];
      for (const fn of list) fn(message.params);
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("cdp socket failed")), { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params: params || {} };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(method + " timed out"));
      }, 30000);
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const fn = (params) => {
        const list = this.listeners.get(method) || [];
        this.listeners.set(method, list.filter((item) => item !== fn));
        resolve(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) || []), fn]);
    });
  }

  close() {
    try { this.ws.close(); } catch { /* already gone */ }
  }
}

/** Fetch artwork from Node: the page is usually cross-origin to the CDN. */
async function measureArtwork(artwork, referer) {
  const out = [];
  for (const item of artwork.slice(0, 4)) {
    const entry = { ...item, bytes: 0, status: 0, mime: "" };
    if (!item.src.startsWith("http")) {
      out.push(entry);
      continue;
    }
    try {
      const response = await fetch(item.src, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          referer,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });
      const body = await response.arrayBuffer();
      entry.status = response.status;
      entry.bytes = body.byteLength;
      entry.mime = response.headers.get("content-type") || "";
    } catch (error) {
      entry.error = String(error && error.message ? error.message : error).slice(0, 120);
    }
    out.push(entry);
  }
  return out;
}

async function probeOne(cdp, target) {
  const result = {
    id: target.id,
    name: target.name,
    url: target.url,
    ok: false,
    error: "",
    pageTitle: "",
    hasMediaSession: false,
    metadata: null,
    artwork: [],
    artworkBytes: 0,
    videos: [],
    videoPlaying: false,
  };
  let targetId = "";
  try {
    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    targetId = created.targetId;
    const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const sessionId = attached.sessionId;
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    const loaded = cdp.once("Page.loadEventFired");
    const navigation = await cdp.send("Page.navigate", { url: target.url }, sessionId);
    if (navigation.errorText) {
      result.error = navigation.errorText;
    } else {
      await Promise.race([loaded, sleep(NAV_TIMEOUT)]);
      await sleep(SETTLE);
      const expression = "(" + pageProbe.toString() + ")()";
      const evaluated = await cdp.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: false,
      }, sessionId);
      if (evaluated.exceptionDetails) {
        result.error = String(evaluated.exceptionDetails.text || "exception");
      } else {
        const value = evaluated.result && evaluated.result.value;
        result.ok = true;
        result.pageTitle = String((value && value.pageTitle) || "");
        result.hasMediaSession = !!(value && value.hasMediaSession);
        result.metadata = (value && value.metadata) || null;
        result.videos = (value && value.videos) || [];
        result.videoPlaying = result.videos.some((video) => !video.paused);
        if (result.metadata && result.metadata.artwork.length) {
          result.artwork = await measureArtwork(result.metadata.artwork, target.url);
          result.artworkBytes = Math.max(0, ...result.artwork.map((item) => item.bytes || 0));
        }
      }
    }
  } catch (error) {
    result.error = String(error && error.message ? error.message : error).slice(0, 160);
  } finally {
    if (targetId) {
      try { await cdp.send("Target.closeTarget", { targetId }); } catch { /* window gone */ }
    }
  }
  return result;
}

/** Ask the OS for a port nothing is listening on. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

/**
 * Chrome 157 writes no "DevTools listening" line to stderr, so the endpoint is
 * read from the HTTP side instead: /json/version is up as soon as the browser
 * accepts protocol clients.
 */
async function devtoolsEndpoint(port) {
  const response = await fetch("http://127.0.0.1:" + port + "/json/version", {
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) return "";
  const info = await response.json();
  return String(info.webSocketDebuggerUrl || "");
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error("no Chrome/Edge found; pass --browser <path>");
    process.exit(2);
  }
  const profile = mkdtempSync(join(tmpdir(), "mediasession-probe-"));
  const port = await freePort();
  const args = [
    HEADFUL ? "--headless=false" : "--headless=new",
    "--remote-debugging-port=" + port,
    "--user-data-dir=" + profile,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1280,720",
    "about:blank",
  ];
  const child = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  let endpoint = "";
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      endpoint = await devtoolsEndpoint(port);
    } catch {
      endpoint = "";
    }
    if (endpoint) break;
    if (child.exitCode !== null) break;
    await sleep(200);
  }
  if (!endpoint) {
    console.error("browser did not expose a DevTools endpoint on port " + port);
    console.error(stderr.slice(-800));
    if (child.pid) spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
    process.exit(2);
  }

  const cdp = await Cdp.connect(endpoint);
  let targets = ONLY ? TARGETS.filter((item) => item.id.includes(ONLY) || item.name.includes(ONLY)) : TARGETS;
  if (ADHOC) targets = [{ id: "adhoc", name: ADHOC, url: ADHOC }];
  const results = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    process.stderr.write("[" + (index + 1) + "/" + targets.length + "] " + target.name + " ... ");
    const result = await probeOne(cdp, target);
    results.push(result);
    process.stderr.write(
      (result.ok ? "ok" : "fail") +
      " ms=" + (result.hasMediaSession ? "yes" : "no") +
      " art=" + result.artwork.length +
      " bytes=" + result.artworkBytes +
      (result.error ? " err=" + result.error : "") + "\n",
    );
  }

  const payload = {
    ts: Date.now(),
    browser,
    settleMs: SETTLE,
    results,
    summary: {
      probed: results.length,
      reachable: results.filter((item) => item.ok).length,
      withMetadata: results.filter((item) => item.metadata && (item.metadata.title || item.metadata.artist)).length,
      withArtwork: results.filter((item) => item.artworkBytes > 0).length,
    },
  };
  const text = JSON.stringify(payload, null, 2);
  if (OUT) writeFileSync(OUT, text + "\n", "utf8");
  process.stdout.write(text + "\n");
  cdp.close();
  /*
   * Chrome leaves helper processes behind when only the launcher is killed, and
   * a probe that runs for a while ends up with dozens of them. taskkill /T walks
   * the tree; /F is required because the renderer ignores a polite request.
   */
  if (child.pid) {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" });
  }
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* locks */ }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
