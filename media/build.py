"""
Assemble the demo from per-scene video and per-scene narration.

Audio is placed inside the scene it belongs to, never against an absolute
timeline. That is what kept the first cut out of sync: a global clock means one
scroll landing half a second late throws every caption after it. Here a scene
owns its own lines, and the scene is padded to whichever of the two is longer,
so re-recording one scene cannot move the words in any other.

    python media/build.py            # everything
    python media/build.py 06-wallet  # one scene's audio, then reassemble
"""
import json, io, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
cfg = json.load(io.open("media/script.json", encoding="utf-8"))
W, H, FPS = 1920, 1080, 30
GAP = 0.55      # breath between lines
LEAD = 0.45     # a beat before the first line of a scene
WORK = "media/work"
os.makedirs(WORK, exist_ok=True)


def run(args):
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode:
        raise SystemExit(f"ffmpeg failed:\n{' '.join(args)}\n{p.stderr[-1500:]}")


def dur(path):
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True).stdout.strip())


def ts(s):
    h, m = int(s // 3600), int(s % 3600 // 60)
    return f"{h:02d}:{m:02d}:{s % 60:06.3f}".replace(".", ",")


srt, idx, clock = [], 1, 0.0
parts = []

for sc in cfg["scenes"]:
    sid = sc["id"]
    vsrc = f"media/seg/{sid}.webm"
    vlen = dur(vsrc)

    # Where each line sits inside this scene, and how long the scene must be.
    at, t = [], LEAD
    for i, line in enumerate(sc["lines"]):
        a = f"media/vo/{sid}_{i}.mp3"
        at.append((t, a, line))
        t += dur(a) + GAP
    need = max(vlen, t + 0.4)

    # Audio bed for the scene.
    abed = f"{WORK}/{sid}.wav"
    ins, filt = [], []
    for i, (start, a, _) in enumerate(at):
        ins += ["-i", a]
        filt.append(f"[{i}:a]adelay={int(start*1000)}|{int(start*1000)}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(at))) + \
          f"amix=inputs={len(at)}:normalize=0,apad,atrim=0:{need:.3f},aresample=48000[out]"
    run(["ffmpeg", "-loglevel", "error", "-y"] + ins +
        ["-filter_complex", ";".join(filt) + ";" + mix, "-map", "[out]", abed])

    # Video for the scene, held on its last frame if the words run longer.
    vout = f"{WORK}/{sid}.mp4"
    vf = f"scale={W}:{H}:flags=lanczos,fps={FPS}"
    if need > vlen + 0.05:
        vf += f",tpad=stop_mode=clone:stop_duration={need - vlen:.3f}"
    run(["ffmpeg", "-loglevel", "error", "-y", "-i", vsrc, "-i", abed,
         "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
         "-t", f"{need:.3f}", vout])
    parts.append(vout)

    for start, a, line in at:
        srt.append(f"{idx}\n{ts(clock+start)} --> {ts(clock+start+dur(a))}\n{line}\n")
        idx += 1
    clock += need
    print(f"  {sid:16s} {need:5.1f}s")

io.open("media/captions.srt", "w", encoding="utf-8").write("\n".join(srt))
with io.open(f"{WORK}/list.txt", "w", encoding="utf-8") as f:
    for p in parts:
        f.write(f"file '{os.path.basename(p)}'\n")

run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0",
     "-i", f"{WORK}/list.txt", "-c", "copy", f"{WORK}/silent.mp4"])

# Captions: small, high contrast, out of the way of the page chrome.
style = ("FontName=Arial,FontSize=13,Bold=1,PrimaryColour=&H00FFFFFF,"
         "OutlineColour=&HC0000000,BorderStyle=3,Outline=2,Shadow=0,MarginV=26")
run(["ffmpeg", "-loglevel", "error", "-y", "-i", f"{WORK}/silent.mp4",
     "-vf", f"subtitles=media/captions.srt:force_style='{style}'",
     "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
     "-c:a", "copy", "media/claim-demo.mp4"])
print(f"\nmedia/claim-demo.mp4  {dur('media/claim-demo.mp4'):.1f}s")
