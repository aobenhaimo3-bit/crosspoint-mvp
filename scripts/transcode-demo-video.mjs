import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

function usage() {
  return "Usage: node scripts/transcode-demo-video.mjs <input.webm> <output.mp4>";
}

function findChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (explicit && existsSync(explicit)) return explicit;

  const browserRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "ms-playwright")
    : path.join(tmpdir(), "ms-playwright");
  if (existsSync(browserRoot)) {
    const candidates = readdirSync(browserRoot)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
      .map((name) => path.join(browserRoot, name, "chrome-win64", "chrome.exe"))
      .filter(existsSync);
    if (candidates[0]) return candidates[0];
  }

  const bundled = chromium.executablePath();
  if (existsSync(bundled)) return bundled;
  throw new Error(
    "No Playwright Chromium executable was found. Install it with `pnpm exec playwright install chromium`, " +
      "or set PLAYWRIGHT_CHROMIUM_EXECUTABLE.",
  );
}

function createMediaServer(inputPath) {
  const size = statSync(inputPath).size;
  return createServer((request, response) => {
    if (request.url !== "/input.webm") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<!doctype html><html><body></body></html>");
      return;
    }

    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        response.writeHead(416, { "Content-Range": `bytes */${size}` });
        response.end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        response.writeHead(416, { "Content-Range": `bytes */${size}` });
        response.end();
        return;
      }
      response.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Type": "video/webm",
      });
      createReadStream(inputPath, { start, end }).pipe(response);
      return;
    }

    response.writeHead(200, {
      "Accept-Ranges": "bytes",
      "Content-Length": size,
      "Content-Type": "video/webm",
    });
    createReadStream(inputPath).pipe(response);
  });
}

const [, , inputArgument, outputArgument] = process.argv;
if (!inputArgument || !outputArgument) {
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
}

const inputPath = path.resolve(inputArgument);
const outputPath = path.resolve(outputArgument);
if (!existsSync(inputPath) || !statSync(inputPath).isFile()) {
  throw new Error(`Input video does not exist: ${inputPath}`);
}
if (path.extname(outputPath).toLowerCase() !== ".mp4") {
  throw new Error("The output filename must use the .mp4 extension.");
}
if (inputPath === outputPath) throw new Error("Input and output paths must be different.");

const server = createMediaServer(inputPath);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start the local media server.");

let browser;
try {
  const executablePath = findChromium();
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  const chunks = [];
  await page.exposeFunction("__acceptMp4Chunk", (base64) => {
    chunks.push(Buffer.from(base64, "base64"));
  });
  await page.goto(`http://127.0.0.1:${address.port}/`);

  const result = await page.evaluate(async () => {
    const mimeCandidates = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4;codecs=avc1.42E01E,opus",
      "video/mp4",
    ];
    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error("This Chromium build cannot encode H.264 MP4 with MediaRecorder.");

    const video = document.createElement("video");
    video.src = "/input.webm";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("Chromium could not decode the input WebM.")), {
        once: true,
      });
    });

    const requestedWidth = Math.min(1_024, video.videoWidth);
    const width = Math.max(2, requestedWidth - (requestedWidth % 2));
    const proportionalHeight = Math.round((width * video.videoHeight) / video.videoWidth);
    const height = Math.max(2, proportionalHeight - (proportionalHeight % 2));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Could not create the video canvas.");

    const canvasStream = canvas.captureStream(0);
    const videoTrack = canvasStream.getVideoTracks()[0];
    const audioContext = new AudioContext({ sampleRate: 48_000 });
    await audioContext.resume();
    const destination = audioContext.createMediaStreamDestination();
    const master = audioContext.createGain();
    master.gain.value = 0.032;
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1_200;
    filter.Q.value = 0.35;
    master.connect(filter).connect(destination);

    // A quiet, procedural four-chord ambient bed. It is synthesized here and contains no sampled music.
    const chordRoots = [130.81, 110.0, 87.31, 98.0];
    const ratios = [1, 1.25, 1.5, 2];
    const oscillators = ratios.map((ratio, index) => {
      const oscillator = audioContext.createOscillator();
      const voiceGain = audioContext.createGain();
      oscillator.type = index % 2 === 0 ? "sine" : "triangle";
      voiceGain.gain.value = index === 0 ? 0.42 : 0.17;
      oscillator.connect(voiceGain).connect(master);
      oscillator.start();
      return { oscillator, ratio };
    });
    const startAt = audioContext.currentTime;
    const chordLength = 8;
    for (let second = 0; second <= video.duration + chordLength; second += chordLength) {
      const root = chordRoots[(second / chordLength) % chordRoots.length];
      for (const { oscillator, ratio } of oscillators) {
        oscillator.frequency.setTargetAtTime(root * ratio, startAt + second, 1.8);
      }
    }
    master.gain.setValueAtTime(0.0001, startAt);
    master.gain.exponentialRampToValueAtTime(0.032, startAt + Math.min(2, video.duration / 3));
    if (video.duration > 2) {
      master.gain.setValueAtTime(0.032, startAt + video.duration - 2);
      master.gain.exponentialRampToValueAtTime(0.0001, startAt + video.duration);
    }

    const outputStream = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond: width >= 1_000 ? 1_400_000 : 1_000_000,
      audioBitsPerSecond: 96_000,
    });
    let transfer = Promise.resolve();
    recorder.addEventListener("dataavailable", (event) => {
      if (!event.data.size) return;
      transfer = transfer.then(async () => {
        const bytes = new Uint8Array(await event.data.arrayBuffer());
        let binary = "";
        const stride = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += stride) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + stride));
        }
        await window.__acceptMp4Chunk(btoa(binary));
      });
    });

    context.drawImage(video, 0, 0, width, height);
    videoTrack.requestFrame();
    recorder.start(1_000);
    const ended = new Promise((resolve, reject) => {
      video.addEventListener("ended", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("The input video stopped during playback.")), {
        once: true,
      });
    });
    let animationFrame;
    const paint = () => {
      context.drawImage(video, 0, 0, width, height);
      videoTrack.requestFrame();
      if (!video.ended) animationFrame = video.requestVideoFrameCallback(paint);
    };
    animationFrame = video.requestVideoFrameCallback(paint);
    await video.play();
    await ended;
    if (animationFrame) video.cancelVideoFrameCallback(animationFrame);
    context.drawImage(video, 0, 0, width, height);
    videoTrack.requestFrame();
    await new Promise((resolve) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.stop();
    });
    await transfer;
    for (const { oscillator } of oscillators) oscillator.stop();
    await audioContext.close();
    return { duration: video.duration, height, mimeType: recorder.mimeType, width };
  });

  if (chunks.length === 0) throw new Error("Chromium returned an empty MP4 recording.");
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const output = Buffer.concat(chunks);
  if (output.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("The encoded output is not a valid ISO Base Media (MP4) file.");
  }
  writeFileSync(outputPath, output);
  process.stdout.write(
    `Created ${outputPath}\n${result.width}x${result.height}, ${result.duration.toFixed(2)}s, ${result.mimeType}, ${output.length} bytes\n`,
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
