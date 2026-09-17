"""
Assemble the demo: per-scene video, per-scene narration, captions burned in.

Captions follow the house style from the last project: white text with a dark
outline, centred at the foot of the frame, no box. A box covers the product it
is describing, which is the opposite of the point.

Audio belongs to the scene it was written for rather than to an absolute clock.
One scroll landing late used to throw every caption after it; now re-recording a
scene cannot move the words in any other one.

    python media/build.py
"""
import json, io, os, subprocess, textwrap

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
cfg = json.load(io.open("media/script.json", encoding="utf-8"))
W, H, FPS = 1920, 1080, 30
LEAD_TRIM = 1.35   # the dark hold each scene is recorded with
GAP, LEAD = 0.5, 0.35
WORK = "media/work"
FONT = "C:/Windows/Fonts/arialbd.ttf"
FONT_TAG = "C:/Windows/Fonts/arial.ttf"
os.makedirs(WORK, exist_ok=True)


def run(a):
    p = subprocess.run(a, capture_output=True, text=True)
    if p.returncode:
        raise SystemExit(f"ffmpeg failed:\n{' '.join(a)}\n{p.stderr[-1600:]}")


def dur(p):
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
        capture_output=True, text=True).stdout.strip())


def esc(p):
    return p.replace("\\", "/").replace(":", "\:")


def caption(idx, line, tag):
    """
    White, heavily outlined, centred at the foot. Two lines at most.

    The outline has to carry the text over a white sheet as well as a dark one:
    the opening screen is paper, and a thin border left white-on-white there.
    Six pixels of near-opaque black reads on both without needing a box, which
    would cover the product the line is describing.
    """
    rows = textwrap.wrap(line, 58) or [line]
    base = H - 52 - (len(rows) - 1) * 50
    parts = []
    for n, row in enumerate(rows):
        f = os.path.join(WORK, f"c{idx}_{n}.txt")
        io.open(f, "w", encoding="utf-8").write(row)
        parts.append(
            f"drawtext=fontfile='{esc(FONT)}':textfile='{esc(f)}':fontcolor=white:fontsize=34:"
            f"shadowcolor=black@0.9:shadowx=0:shadowy=2:borderw=6:bordercolor=black@0.92:"
            f"x=(w-text_w)/2:y={base - 58 + n * 50}"
        )
    ft = os.path.join(WORK, f"c{idx}_tag.txt")
    io.open(ft, "w", encoding="utf-8").write(tag.upper())
    parts.append(
        f"drawtext=fontfile='{esc(FONT_TAG)}':textfile='{esc(ft)}':fontcolor=0xd8d2c8:fontsize=16:"
        f"shadowcolor=black@0.9:shadowx=0:shadowy=2:borderw=4:bordercolor=black@0.9:"
        f"x=(w-text_w)/2:y={H - 38}"
    )
    return ",".join(parts)


parts, idx = [], 0
for sc in cfg["scenes"]:
    sid, tag = sc["id"], sc.get("tag", "")
    src = f"media/seg/{sid}.webm"
    vlen = dur(src) - LEAD_TRIM

    at, t = [], LEAD
    for i, line in enumerate(sc["lines"]):
        a = f"media/vo/{sid}_{i}.mp3"
        at.append((t, a, line, dur(a)))
        t += dur(a) + GAP
    need = max(vlen, t + 0.35)

    abed = f"{WORK}/{sid}.wav"
    ins, filt = [], []
    for i, (start, a, _, _) in enumerate(at):
        ins += ["-i", a]
        filt.append(f"[{i}:a]adelay={int(start*1000)}|{int(start*1000)}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(at))) + \
          f"amix=inputs={len(at)}:normalize=0,apad,atrim=0:{need:.3f},aresample=48000[o]"
    run(["ffmpeg", "-loglevel", "error", "-y"] + ins +
        ["-filter_complex", ";".join(filt) + ";" + mix, "-map", "[o]", abed])

    # Captions are drawn per line, each enabled only while its line is spoken.
    draws = []
    for start, _, line, d in at:
        idx += 1
        draws.append(f"{caption(idx, line, tag)}:enable='between(t,{start:.2f},{start+d+0.25:.2f})'")
    # enable= applies to the last drawtext only, so wrap each line's stack
    draws = []
    for start, _, line, d in at:
        idx += 1
        stack = caption(idx, line, tag).split(",")
        win = f"enable='between(t,{start:.2f},{start + d + 0.25:.2f})'"
        draws.append(",".join(f"{s}:{win}" for s in stack))

    vf = f"scale={W}:{H}:flags=lanczos,fps={FPS}," + ",".join(draws)
    if need > vlen + 0.05:
        vf += f",tpad=stop_mode=clone:stop_duration={need - vlen:.3f}"

    out = f"{WORK}/{sid}.mp4"
    run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(LEAD_TRIM), "-i", src, "-i", abed,
         "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-t", f"{need:.3f}", out])
    parts.append(out)
    print(f"  {sid:16s} {need:5.1f}s")

with io.open(f"{WORK}/list.txt", "w", encoding="utf-8") as f:
    for p in parts:
        f.write(f"file '{os.path.basename(p)}'\n")
run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
     "-i", f"{WORK}/list.txt", "-c", "copy", "media/claim-demo.mp4"])
print(f"\nmedia/claim-demo.mp4  {dur('media/claim-demo.mp4'):.1f}s")
