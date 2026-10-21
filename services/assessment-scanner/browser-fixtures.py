"""Synthetic browser playback samples. No user content or authority secrets."""
import base64
import io
import json
import math
import struct
import subprocess
import tempfile
import wave
from pathlib import Path
from PIL import Image, ImageDraw
image = Image.new("RGB", (320, 180), (250, 245, 231))
draw = ImageDraw.Draw(image)
draw.rectangle((40, 40, 120, 140), fill=(23, 43, 67))
draw.ellipse((180, 40, 280, 140), fill=(80, 130, 155))
png = io.BytesIO()
image.save(png, format="PNG")
audio = io.BytesIO()
with wave.open(audio, "wb") as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(8000)
    output.writeframes(b"".join(struct.pack("<h", int(2000*math.sin(2*math.pi*440*n/8000))) for n in range(8000*4)))
with tempfile.TemporaryDirectory(dir="/tmp") as directory:
    video = Path(directory) / "synthetic.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=160x96:rate=15:duration=4", "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", str(video)], check=True, timeout=30)
    print(json.dumps([
        {"filename":"placement-image.png","mime":"image/png","kind":"image","base64":base64.b64encode(png.getvalue()).decode()},
        {"filename":"placement-audio.wav","mime":"audio/wav","kind":"audio","base64":base64.b64encode(audio.getvalue()).decode()},
        {"filename":"placement-video.mp4","mime":"video/mp4","kind":"video","base64":base64.b64encode(video.read_bytes()).decode()},
    ]))
