"""
Lay the voice onto the recording at the offsets the recorder measured.

No captions this time, and no guessing: the recorder wrote down the moment each
line's action began, so every line is placed where the thing it describes is
happening on screen. The lead before the clock started is loading, and is
trimmed.

    python media/mixdown.py
"""
import json, io, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
meta = json.load(io.open("media/offsets.json", encoding="utf-8"))
lead, offsets = meta["lead"], meta["offsets"]
SRC, OUT = "media/final/raw.webm", "media/claim-demo.mp4"
W, H, FPS = 1920, 1080, 30


def run(a):
    p = subprocess.run(a, capture_output=True, text=True)
    if p.returncode:
        raise SystemExit(f"ffmpeg failed:\n{' '.join(a[:14])}…\n{p.stderr[-1500:]}")


def dur(p):
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
        capture_output=True, text=True).stdout.strip())


vlen = dur(SRC) - lead

ins, filt = [], []
for i, o in enumerate(offsets):
    ins += ["-i", f"media/vo/{o['id']}.mp3"]
    filt.append(f"[{i}:a]adelay={int(o['at']*1000)}|{int(o['at']*1000)}[a{i}]")
mix = "".join(f"[a{i}]" for i in range(len(offsets))) + \
      f"amix=inputs={len(offsets)}:normalize=0,apad,atrim=0:{vlen:.3f},aresample=48000[o]"
run(["ffmpeg", "-loglevel", "error", "-y"] + ins +
    ["-filter_complex", ";".join(filt) + ";" + mix, "-map", "[o]", "media/voice.wav"])

run(["ffmpeg", "-loglevel", "error", "-y", "-ss", f"{lead:.3f}", "-i", SRC, "-i", "media/voice.wav",
     "-vf", f"scale={W}:{H}:flags=lanczos,fps={FPS}",
     "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-b:a", "192k", "-t", f"{vlen:.3f}", OUT])

last = offsets[-1]
print(f"{OUT}  {dur(OUT):.1f}s   last line ends {last['at'] + last['dur']:.1f}s")
