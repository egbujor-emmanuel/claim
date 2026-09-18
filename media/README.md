# Demo video

`claim-demo.mp4` — 1080p, 30fps, 2:45, voiceover, no captions.

Recorded against the live deployment. Every screen is the product answering a
real address, a real company and a live Jupiter quote.

## How it is built

The voice is generated first, so the line lengths are known before anything is
recorded. The recorder then drives a **single continuous browser session**,
running each action while its line is spoken, and writes down the offset each
line actually began at. The mixdown places the audio at those offsets.

One session matters. Recording scene by scene gives every scene its own empty
opening frame and abrupt ending, and stitching them together shows every seam —
that is where the black gaps came from.

```bash
python media/tts.py        # or regenerate lines in media/vo/
node   media/record.mjs    # one pass -> media/final/raw.webm + media/offsets.json
python media/mixdown.py    # -> media/claim-demo.mp4
```

Narration lives in `media/script.json`. Changing one line means re-synthesising
that line only; the recorder re-times itself around it.

## What it covers

The opening and what Claim is · scrolling into the four SpaceX claims · search ·
the grades · the evidence and its sources · the live Pyth comparison · a switch
reviewed · connecting a wallet · buying a company · the compromise stated before
signing · a whole wallet scanned · the public API.
