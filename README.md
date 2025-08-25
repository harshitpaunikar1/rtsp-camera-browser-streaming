# RTSP Camera Browser Streaming

This repository documents a low-latency camera-to-browser streaming pipeline for existing RTSP feeds.

## Domain
Video Infrastructure / Security

## Overview
Used GStreamer to ingest and adapt the media path before delivering it to a normal browser over WebRTC, with optional recording added without overloading the live path.

## Methodology
1. Started from the client's existing RTSP camera setup and focused on fixing the last-mile browser experience rather than replacing the camera system.
2. Used GStreamer to ingest, decode, transform, and re-encode only when browser compatibility required it, keeping latency as low as practical.
3. Delivered the live stream through WebRTC so operators could open the feed in a browser instead of relying on specialist desktop viewers.
4. Coordinated browser connection setup through a lightweight Node.js signaling layer, with Coturn available for difficult network paths.
5. Included optional FFmpeg recording so the same pipeline could support demo playback or evidence capture without redefining the streaming flow.
6. Logged stream health and failure points to make camera disconnects, browser issues, and pipeline instability easier to diagnose.

## Skills
- RTSP
- GStreamer
- WebRTC
- Node.js
- Coturn
- FFmpeg Recording
- Low-Latency Streaming
- Stream Health Monitoring

## Source
This README was generated from the portfolio project data used by `/Users/harshitpanikar/Documents/Test_Projs/harshitpaunikar1.github.io/index.html`.
