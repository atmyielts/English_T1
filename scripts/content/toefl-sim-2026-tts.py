#!/usr/bin/env python3
"""Offline TTS for the TOEFL iBT 2026 simulator audio (agent: toefl-sim).

Reads content/toefl-2026/audio-manifest.json (written by toefl-sim-2026.mjs),
synthesises every file with Piper (https://github.com/OHF-Voice/piper1-gpl,
run locally; the GPL applies to the program, not to the audio it produces) and
writes MP3s to content/toefl-2026/audio/ plus durations.json. Then re-run
`node scripts/content/toefl-sim-2026.mjs` so the migrations carry durations.

Voices (rhasspy/piper-voices on Hugging Face; dataset licences from each MODEL_CARD,
all allow commercial use):
  f_uk  en_GB-cori-medium      LibriVox recordings, public domain
  f_us1 en_US-ljspeech-medium  LJ Speech dataset, public domain
  f_us2 en_US-kristin-medium   LibriVox recordings, public domain
  m_us1 en_US-john-medium      LibriVox recordings, public domain
  m_us2 en_US-norman-medium    LibriVox recordings, public domain
  m_us3 en_US-joe-medium       OHF-Voice voice-datasets, CC0

Usage (one-off, on a machine with piper-tts and ffmpeg):
  python -m venv .venv && .venv/bin/pip install piper-tts==1.8.0
  # download the six .onnx + .onnx.json voice files into VOICE_DIR
  python scripts/content/toefl-sim-2026-tts.py --voices VOICE_DIR [--only SLUG]
"""
import argparse
import io
import json
import os
import subprocess
import sys
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONTENT = os.path.join(ROOT, "content", "toefl-2026")
AUDIO = os.path.join(CONTENT, "audio")
GAP_SECONDS = 0.7      # silence between speakers / lines
LEAD_SECONDS = 0.3     # silence at the start and end of each file
BITRATE = "40k"        # mono speech; keeps the whole set small


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voices", required=True, help="directory with Piper .onnx voices")
    parser.add_argument("--only", default=None, help="only files whose name starts with this")
    parser.add_argument("--force", action="store_true", help="re-create existing files")
    args = parser.parse_args()

    from piper import PiperVoice, SynthesisConfig  # type: ignore

    manifest = json.load(open(os.path.join(CONTENT, "audio-manifest.json"), encoding="utf-8"))
    voices = {}
    os.makedirs(AUDIO, exist_ok=True)
    durations_path = os.path.join(AUDIO, "durations.json")
    durations = json.load(open(durations_path, encoding="utf-8")) if os.path.exists(durations_path) else {}

    def voice(vid):
        if vid not in voices:
            name = manifest["voices"][vid]
            voices[vid] = PiperVoice.load(os.path.join(args.voices, f"{name}.onnx"))
        return voices[vid]

    done = 0
    for entry in manifest["files"]:
        name = entry["file"]
        if args.only and not name.startswith(args.only):
            continue
        out_mp3 = os.path.join(AUDIO, name)
        if os.path.exists(out_mp3) and name in durations and not args.force:
            continue
        rate = None
        frames = bytearray()
        for i, seg in enumerate(entry["segments"]):
            v = voice(seg["voice"])
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wav:
                v.synthesize_wav(seg["text"], wav, syn_config=SynthesisConfig(length_scale=entry.get("length_scale", 1.0)))
            buf.seek(0)
            with wave.open(buf, "rb") as wav:
                r = wav.getframerate()
                if rate is None:
                    rate = r
                    frames += b"\x00\x00" * int(rate * LEAD_SECONDS)
                if r != rate:
                    raise SystemExit(f"{name}: sample rate mismatch {r} != {rate}")
                if i > 0:
                    frames += b"\x00\x00" * int(rate * GAP_SECONDS)
                frames += wav.readframes(wav.getnframes())
        frames += b"\x00\x00" * int(rate * LEAD_SECONDS)
        tmp_wav = out_mp3 + ".wav"
        with wave.open(tmp_wav, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(bytes(frames))
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", tmp_wav, "-ac", "1", "-ar", str(rate),
                        "-b:a", BITRATE, "-map_metadata", "-1", out_mp3], check=True)
        os.remove(tmp_wav)
        durations[name] = round(len(frames) / 2 / rate, 2)
        done += 1
        if done % 10 == 0:
            print(f"{done} files...", flush=True)
            json.dump(durations, open(durations_path, "w", encoding="utf-8"), indent=1, sort_keys=True)
    json.dump(durations, open(durations_path, "w", encoding="utf-8"), indent=1, sort_keys=True)
    print(f"synthesised {done} files; {len(durations)} durations recorded")
    return 0


if __name__ == "__main__":
    sys.exit(main())
