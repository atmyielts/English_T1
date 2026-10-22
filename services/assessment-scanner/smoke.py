"""Runs real AV and complete decoding, inside the networkless scanner sandbox.
All samples are generated in its temporary filesystem, never the host checkout.
"""
import json
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from PIL import Image
from scanner import inspect_file, signature_status, ScannerFailure

def main():
    database = Path("/signatures")
    status = signature_status(database)
    assert len(status["signature_version"]) == 64
    assert not any("SECRET" in key or key == "ARTIFACT_KEYRING" for key in os.environ)
    with tempfile.TemporaryDirectory(dir="/tmp", prefix="scanner-test-") as directory:
        root = Path(directory)
        image = Image.new("RGB", (24, 24), (255, 240, 210))
        png = root / "image.png"
        image.save(png)
        pdf = root / "document.pdf"
        image.save(pdf, save_all=True, append_images=[image.copy()])
        audio = root / "audio.wav"
        with wave.open(str(audio), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(8000)
            output.writeframes(b"\0\0" * 8000)
        video = root / "video.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=32x32:d=1", "-c:v", "mpeg4", "-y", str(video)], check=True, timeout=30)
        webm = root / "video.webm"
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-c:v", "libvpx-vp9", "-threads", "2", "-y", str(webm)], check=True, timeout=30)
        matroska = root / "not-webm.mkv"
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-c", "copy", "-y", str(matroska)], check=True, timeout=30)
        audio_only = root / "not-video.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-c:a", "aac", "-y", str(audio_only)], check=True, timeout=30)
        native_audio = root / "native-audio.webm"
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-c:a", "libopus", "-live", "1", "-y", str(native_audio)], check=True, timeout=30)
        native_video = root / "native-video.webm"
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(webm), "-c", "copy", "-live", "1", "-y", str(native_video)], check=True, timeout=30)
        fragmented_audio = root / "fragmented-audio.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(audio), "-c:a", "aac", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-y", str(fragmented_audio)], check=True, timeout=30)
        # Exercise the actual missing-header case, not only seekable FFmpeg files.
        for file in [native_audio,native_video]:
            probe=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_format","-of","json",str(file)]))
            assert "duration" not in probe["format"], probe
        for file,mime in [(native_audio,"audio/webm"),(native_video,"video/webm"),(audio_only,"audio/mp4"),(fragmented_audio,"audio/mp4")]:
            receipt=inspect_file(file,mime,database)
            assert receipt["verdict"]=="clean" and receipt["decoder_checked"] and receipt["detected_mime"]==mime,(mime,receipt)
        for file,mime in [(webm,"audio/webm"),(video,"audio/mp4"),(native_audio,"video/webm"),(matroska,"audio/webm")]:
            assert inspect_file(file,mime,database)["verdict"]=="rejected",(file,mime)
        for file,mime in [(matroska,"video/webm"),(audio_only,"video/mp4")]:
            assert inspect_file(file,mime,database)["verdict"] == "rejected"
        for file, mime in [(png,"image/png"),(pdf,"application/pdf"),(audio,"audio/wav"),(video,"video/mp4"),(webm,"video/webm")]:
            receipt = inspect_file(file, mime, database)
            assert receipt["verdict"] == "clean", (mime, receipt)
            assert receipt["decoder_checked"] and receipt["detected_mime"] == mime
        assert inspect_file(png, "image/jpeg", database)["verdict"] == "rejected"
        broken = root / "truncated.png"
        broken.write_bytes(png.read_bytes()[:50])
        assert inspect_file(broken, "image/png", database)["verdict"] == "rejected"
        # A syntactically valid PDF with active JavaScript is rejected even if AV
        # has no signature for it. Correct offsets avoid testing only corruption.
        active = root / "active.pdf"
        objects=[b"<< /Type /Catalog /Pages 2 0 R /OpenAction 5 0 R >>",b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>",b"<< /Length 0 >>\nstream\n\nendstream",b"<< /S /JavaScript /JS (app.alert\\(1\\)) >>"]
        content=bytearray(b"%PDF-1.4\n");offsets=[]
        for index,obj in enumerate(objects,1):
            offsets.append(len(content));content.extend(str(index).encode()+b" 0 obj\n"+obj+b"\nendobj\n")
        xref=len(content);content.extend(b"xref\n0 6\n0000000000 65535 f \n")
        for offset in offsets: content.extend(f"{offset:010d} 00000 n \n".encode())
        content.extend(f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode());active.write_bytes(content)
        subprocess.run(["qpdf","--check",str(active)],check=True,capture_output=True)
        assert inspect_file(active,"application/pdf",database)["verdict"] == "rejected"
        # Harmless industry-standard detection string, created only in this sandbox.
        eicar = root / "antivirus-test"
        eicar.write_bytes(b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$" + b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")
        rejection = inspect_file(eicar, "image/png", database)
        assert rejection["verdict"] == "rejected" and rejection["reason"] == "malware_or_engine_limit"
        empty = root / "no-signatures"
        empty.mkdir()
        try:
            signature_status(empty)
            raise AssertionError("Missing signatures were accepted")
        except ScannerFailure:
            pass
    print(json.dumps({"state":"passed","checks":20,**status}))

if __name__ == "__main__":
    main()
