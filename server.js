/**
 * RTSP-to-browser streaming server.
 * Ingests RTSP feeds via GStreamer, delivers to browser over WebRTC with Node.js signaling.
 * Optional FFmpeg recording path for evidence capture.
 */

"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

let express, socketIo;
try {
  express = require("express");
  socketIo = require("socket.io");
} catch (e) {
  console.error("Missing deps: npm install express socket.io");
  process.exit(1);
}

const PORT = process.env.PORT || 3001;

// ICE servers for WebRTC fallback
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
];
if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
  ICE_SERVERS.push({
    urls: process.env.TURN_URL,
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  });
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// Stream registry: streamId -> { rtspUrl, gstProcess, viewers: Set<socketId>, recording: bool }
const streams = new Map();

/**
 * Builds a GStreamer pipeline string for RTSP-to-WebRTC adaptation.
 * Decodes RTSP H264, re-encodes to VP8 for browser compatibility.
 */
function buildGStreamerPipeline(rtspUrl) {
  return [
    `rtspsrc location=${rtspUrl} latency=100`,
    "rtph264depay",
    "avdec_h264",
    "videoconvert",
    "vp8enc deadline=1 target-bitrate=1000000",
    "rtpvp8pay",
    "udpsink host=127.0.0.1 port=5004",
  ].join(" ! ");
}

/**
 * Starts GStreamer for a given RTSP stream.
 * Returns the child process or null if gst-launch-1.0 is not available.
 */
function startGStreamer(streamId, rtspUrl) {
  const pipeline = buildGStreamerPipeline(rtspUrl);
  console.log(`[gst:${streamId}] Starting pipeline: ${pipeline}`);
  try {
    const proc = spawn("gst-launch-1.0", ["-e", ...pipeline.split(" ")], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout.on("data", (d) => process.stdout.write(`[gst:${streamId}] ${d}`));
    proc.stderr.on("data", (d) => process.stderr.write(`[gst:${streamId}] ${d}`));
    proc.on("exit", (code) => {
      console.log(`[gst:${streamId}] exited with code ${code}`);
      if (streams.has(streamId)) {
        streams.get(streamId).gstProcess = null;
        io.emit("stream_error", { streamId, message: "GStreamer pipeline stopped." });
      }
    });
    return proc;
  } catch (err) {
    console.warn(`[gst:${streamId}] gst-launch-1.0 not available: ${err.message}`);
    return null;
  }
}

/**
 * Starts FFmpeg recording for a stream to a local file.
 */
function startRecording(streamId, rtspUrl) {
  const outPath = path.join(__dirname, "recordings", `${streamId}_${Date.now()}.mp4`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  console.log(`[ffmpeg:${streamId}] Recording to ${outPath}`);
  try {
    const proc = spawn("ffmpeg", [
      "-rtsp_transport", "tcp",
      "-i", rtspUrl,
      "-c:v", "copy",
      "-c:a", "aac",
      "-movflags", "+faststart",
      outPath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    proc.stderr.on("data", (d) => process.stderr.write(`[ffmpeg:${streamId}] ${d}`));
    return { proc, outPath };
  } catch (err) {
    console.warn(`[ffmpeg:${streamId}] FFmpeg not available: ${err.message}`);
    return null;
  }
}

// --- Socket.IO signaling ---
io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on("register_stream", ({ streamId, rtspUrl, enableRecording }) => {
    if (!streamId || !rtspUrl) {
      socket.emit("error", { message: "streamId and rtspUrl are required." });
      return;
    }
    const sanitizedId = streamId.replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 32);
    if (!streams.has(sanitizedId)) {
      const gstProcess = startGStreamer(sanitizedId, rtspUrl);
      let recordingInfo = null;
      if (enableRecording) {
        recordingInfo = startRecording(sanitizedId, rtspUrl);
      }
      streams.set(sanitizedId, {
        rtspUrl,
        gstProcess,
        recordingInfo,
        viewers: new Set(),
        startedAt: Date.now(),
      });
    }
    socket.data.streamId = sanitizedId;
    streams.get(sanitizedId).viewers.add(socket.id);
    socket.join(sanitizedId);
    socket.emit("stream_ready", {
      streamId: sanitizedId,
      iceServers: ICE_SERVERS,
      viewerCount: streams.get(sanitizedId).viewers.size,
    });
    console.log(`[stream:${sanitizedId}] viewer joined: ${socket.id}`);
  });

  // WebRTC signaling relay for stream viewers
  socket.on("viewer_offer", ({ streamId, offer }) => {
    socket.to(streamId).emit("viewer_offer", { offer, from: socket.id });
  });

  socket.on("stream_answer", ({ to, answer }) => {
    io.to(to).emit("stream_answer", { answer });
  });

  socket.on("ice_candidate", ({ streamId, candidate }) => {
    socket.to(streamId).emit("ice_candidate", { candidate, from: socket.id });
  });

  // Stream health reporting
  socket.on("stream_health", ({ streamId, fps, bitrate, latencyMs }) => {
    console.log(`[health:${streamId}] fps=${fps} bitrate=${bitrate} latency=${latencyMs}ms`);
    io.to(streamId).emit("health_update", { streamId, fps, bitrate, latencyMs, ts: Date.now() });
  });

  socket.on("disconnect", () => {
    const streamId = socket.data.streamId;
    if (streamId && streams.has(streamId)) {
      streams.get(streamId).viewers.delete(socket.id);
      console.log(`[stream:${streamId}] viewer left: ${socket.id}`);
    }
    console.log(`[disconnect] ${socket.id}`);
  });
});

// --- REST endpoints ---
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", activeStreams: streams.size, ts: Date.now() });
});

app.get("/streams", (req, res) => {
  const info = [];
  streams.forEach((s, id) => {
    info.push({
      streamId: id,
      rtspUrl: s.rtspUrl,
      viewers: s.viewers.size,
      recording: !!s.recordingInfo,
      gstRunning: !!(s.gstProcess && !s.gstProcess.killed),
      startedAt: s.startedAt,
    });
  });
  res.json(info);
});

app.delete("/streams/:id", (req, res) => {
  const id = req.params.id;
  if (!streams.has(id)) {
    return res.status(404).json({ error: "Stream not found." });
  }
  const stream = streams.get(id);
  if (stream.gstProcess) {
    stream.gstProcess.kill("SIGTERM");
  }
  if (stream.recordingInfo && stream.recordingInfo.proc) {
    stream.recordingInfo.proc.kill("SIGTERM");
  }
  streams.delete(id);
  io.to(id).emit("stream_stopped", { streamId: id });
  res.json({ message: `Stream ${id} stopped.` });
});

// Serve static viewer page if present
const staticDir = path.join(__dirname, "public");
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

server.listen(PORT, () => {
  console.log(`RTSP streaming server on port ${PORT}`);
  console.log(`TURN configured: ${ICE_SERVERS.length > 1 ? "yes" : "no (STUN only)"}`);
});

module.exports = { app, server, io };
