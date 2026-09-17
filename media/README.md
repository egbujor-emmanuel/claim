# Demo video

`claim-demo.mp4` — 1080p, 71 seconds, narrated with burned-in captions.

Recorded against the live deployment, not a mock. Every screen in it is the
product responding to a real address, a real company and a live Jupiter quote.

## What it shows

| | |
|---|---|
| 0:00 | The opening: scroll through the letter into the SpaceX case |
| 0:19 | SpaceX — four tokens, four legal relationships, five routable moves |
| 0:33 | Buy a company: 154 reachable, 83 where the strongest claim is not the one you can buy |
| 0:50 | A wallet scanned: every position graded, worst claim first, actionable switches on top |
| 1:03 | The public API |

## Rebuilding it

```bash
node media/record.mjs [baseUrl]   # capture the walkthrough
```

Narration lines live in `media/script.json`, one file per line in `media/vo/`.
A line is re-synthesised only when its text changes, so fixing one sentence
does not mean recording the video again.
