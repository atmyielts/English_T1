"""Format validation worker. No authority secrets, URLs or uploader filenames."""
import json
import math
import os
import resource
import subprocess
import sys
import tempfile
import warnings
from pathlib import Path

class Rejected(Exception):
    pass

def command(args, timeout=120):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False, env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "HOME": "/tmp"})
    if result.returncode:
        raise Rejected("decoder_failed")
    if len(result.stdout) > 16000000:
        raise Rejected("decoder_metadata_limit")
    return result.stdout

def webm_header(path):
    # FFprobe shares one demuxer for Matroska/WebM. Its format_name alone cannot
    # prove WebM; read the actual bounded EBML DocType before full decoding.
    with open(path, "rb") as source:
        data = source.read(8192)
    def vint(offset, identifier=False):
        if offset >= len(data) or not data[offset]:
            raise Rejected("invalid_ebml_header")
        width = 1
        while not data[offset] & (128 >> (width - 1)):
            width += 1
        if width > (4 if identifier else 8) or offset + width > len(data):
            raise Rejected("invalid_ebml_header")
        value = int.from_bytes(data[offset:offset+width], "big")
        if not identifier:
            value &= (1 << (7 * width)) - 1
        return value, offset + width
    identifier, offset = vint(0, True)
    size, offset = vint(offset)
    end = offset + size
    if identifier != 0x1A45DFA3 or size > 4096 or end > len(data):
        raise Rejected("invalid_ebml_header")
    document_type = None
    while offset < end:
        identifier, offset = vint(offset, True)
        size, offset = vint(offset)
        if offset + size > end:
            raise Rejected("invalid_ebml_header")
        if identifier == 0x4282:
            if document_type is not None:
                raise Rejected("ambiguous_ebml_header")
            document_type = data[offset:offset+size]
        offset += size
    return document_type == b"webm"

def decode(path, declared):
    with open(path, "rb") as source:
        head = source.read(32)
    image = head.startswith(b"\x89PNG\r\n\x1a\n") or head.startswith(b"\xff\xd8\xff") or (head.startswith(b"RIFF") and head[8:12] == b"WEBP")
    if image:
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = 40000000
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(path) as frame:
            mime = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}.get(frame.format)
            if mime != declared or getattr(frame, "n_frames", 1) != 1:
                raise Rejected("image_format_or_animation_policy")
            frame.verify()
        with Image.open(path) as frame:
            frame.load()
            if max(frame.size) > 32768:
                raise Rejected("image_dimensions_limit")
        return mime
    if head.startswith(b"%PDF-"):
        if declared != "application/pdf":
            raise Rejected("mime_mismatch")
        command(["qpdf", "--check", str(path)])
        objects = json.loads(command(["qpdf", "--json", "--json-stream-data=none", str(path)]))
        forbidden = {"/JavaScript", "/JS", "/Launch", "/EmbeddedFile", "/Filespec", "/RichMedia", "/AcroForm", "/XFA", "/OpenAction", "/AA"}
        def inspect(value):
            if isinstance(value, dict):
                if forbidden.intersection(value):
                    raise Rejected("active_pdf_policy")
                for child in value.values():
                    inspect(child)
            elif isinstance(value, list):
                for child in value:
                    inspect(child)
            elif isinstance(value, str) and value in forbidden:
                raise Rejected("active_pdf_policy")
        inspect(objects)
        info = command(["pdfinfo", str(path)]).decode("utf-8", "replace")
        pages = next((int(line.split(":", 1)[1].strip()) for line in info.splitlines() if line.startswith("Pages:")), 0)
        encrypted = next((line.split(":", 1)[1].strip().split()[0] for line in info.splitlines() if line.startswith("Encrypted:")), "unknown")
        if not 1 <= pages <= 200 or encrypted != "no":
            raise Rejected("pdf_page_or_encryption_policy")
        # Decode every page at a bounded resolution; don't mistake text extraction
        # or one rendered page for validation of the complete document.
        with tempfile.TemporaryDirectory(prefix="pdf-decode-", dir="/tmp") as directory:
            target = Path(directory) / "decoded-page"
            for page in range(1, pages + 1):
                command(["pdftoppm", "-f", str(page), "-l", str(page), "-singlefile", "-scale-to", "1600", "-png", str(path), str(target)])
                target.with_suffix(".png").unlink(missing_ok=True)
        return declared
    if declared not in {"audio/mpeg", "audio/wav", "audio/ogg", "audio/webm", "audio/mp4", "video/mp4", "video/webm"}:
        raise Rejected("unsupported_format")
    probe = json.loads(command(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-show_format", "-show_streams", "-of", "json", str(path)]))
    formats = set(probe.get("format", {}).get("format_name", "").split(","))
    expected = {"audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/webm": "webm", "audio/mp4": "mp4", "video/mp4": "mp4", "video/webm": "webm"}[declared]
    streams = probe.get("streams", [])
    if expected not in formats or not streams:
        raise Rejected("mime_mismatch")
    if declared.endswith("/webm"):
        if not webm_header(path) or any(s.get("codec_name") not in {"vp8", "vp9", "av1", "opus", "vorbis"} for s in streams):
            raise Rejected("mime_mismatch")
    if declared.endswith("/mp4"):
        brand = probe.get("format", {}).get("tags", {}).get("major_brand", "").strip()
        if head[4:8] != b"ftyp" or not (brand.startswith("iso") or brand in {"mp41", "mp42", "avc1", "dash", "M4V", "M4A", "MSNV"}):
            raise Rejected("mime_mismatch")
    if declared.startswith("video/") and not any(s.get("codec_type") == "video" for s in streams):
        raise Rejected("video_stream_required")
    if any(s.get("codec_type") not in {"audio", "video"} for s in streams):
        raise Rejected("embedded_stream_policy")
    if declared.startswith("audio/") and any(s.get("codec_type") == "video" for s in streams):
        raise Rejected("unexpected_video_stream")
    if declared.startswith("audio/") and not any(s.get("codec_type") == "audio" for s in streams):
        raise Rejected("audio_stream_required")
    duration = probe.get("format", {}).get("duration")
    # Native streaming WebM/fragmented MP4 may omit a duration header. Do not
    # invent one or reject otherwise valid complete takes: require a successful
    # full decode and bounded output timestamps below, for every media file.
    if duration is not None and (not math.isfinite(float(duration)) or not 0 < float(duration) <= 21600):
        raise Rejected("media_duration_or_dimensions_limit")
    if duration is None and expected not in {"webm", "mp4"}:
        raise Rejected("media_duration_required")
    if any(int(s.get("width", 0)) * int(s.get("height", 0)) > 40000000 for s in streams):
        raise Rejected("media_duration_or_dimensions_limit")
    progress = command(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-nostats", "-progress", "pipe:1", "-protocol_whitelist", "file,pipe", "-i", str(path), "-map", "0", "-threads", "2", "-f", "null", "-"], timeout=600).decode("ascii", "strict")
    times = [int(line.split("=", 1)[1]) for line in progress.splitlines() if line.startswith("out_time_us=") and line.split("=", 1)[1] not in {"N/A"}]
    if "progress=end" not in progress.splitlines() or not times or not 0 < max(times) <= 21600000000:
        raise Rejected("decoded_duration_limit")
    return declared

if __name__ == "__main__":
    resource.setrlimit(resource.RLIMIT_AS, (2147483648, 2147483648))
    resource.setrlimit(resource.RLIMIT_CPU, (600, 600))
    resource.setrlimit(resource.RLIMIT_FSIZE, (20000000, 20000000))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    os.environ.clear()
    try:
        print(json.dumps({"detected_mime": decode(Path(sys.argv[1]), sys.argv[2]), "decoder_checked": True}))
    except Exception:
        print(json.dumps({"decoder_checked": False, "reason": "decoder_or_policy_rejection"}))
        sys.exit(1)
