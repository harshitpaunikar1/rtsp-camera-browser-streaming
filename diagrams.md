# RTSP Camera Browser Streaming Diagrams

Generated on 2026-04-26T04:29:37Z from README narrative plus project blueprint requirements.

## RTSP to WebRTC pipeline

```mermaid
flowchart TD
    N1["Step 1\nStarted from the client's existing RTSP camera setup and focused on fixing the las"]
    N2["Step 2\nUsed GStreamer to ingest, decode, transform, and re-encode only when browser compa"]
    N1 --> N2
    N3["Step 3\nDelivered the live stream through WebRTC so operators could open the feed in a bro"]
    N2 --> N3
    N4["Step 4\nCoordinated browser connection setup through a lightweight Node.js signaling layer"]
    N3 --> N4
    N5["Step 5\nIncluded optional FFmpeg recording so the same pipeline could support demo playbac"]
    N4 --> N5
```

## GStreamer pipeline graph

```mermaid
flowchart LR
    N1["Inputs\nMedical PDFs, guidelines, or evidence documents"]
    N2["Decision Layer\nGStreamer pipeline graph"]
    N1 --> N2
    N3["User Surface\nOperator-facing UI or dashboard surface described in the README"]
    N2 --> N3
    N4["Business Outcome\nInference or response latency"]
    N3 --> N4
```

## Evidence Gap Map

```mermaid
flowchart LR
    N1["Present\nREADME, diagrams.md, local SVG assets"]
    N2["Missing\nSource code, screenshots, raw datasets"]
    N1 --> N2
    N3["Next Task\nReplace inferred notes with checked-in artifacts"]
    N2 --> N3
```
