"""Read only locally generated test PDFs; render with Poppler for visual/QR QA."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from pypdf import PdfReader

path = Path(sys.argv[1]).resolve()
assert 100 <= path.stat().st_size <= 3_000_000
reader = PdfReader(str(path))
assert 2 <= len(reader.pages) <= 8
assert "/OpenAction" not in reader.trailer["/Root"]
assert "/JavaScript" not in reader.trailer["/Root"].get("/Names", {})
attachments = reader.attachments
credentials = [name for name in attachments if name.startswith("schood-certificate-") and name.endswith(".json")]
assert len(credentials) == 1
certificate = json.loads(attachments[credentials[0]][0])
claims = json.loads(base64.urlsafe_b64decode(certificate["payload"] + "=" * (-len(certificate["payload"]) % 4)))
# The record can continue over pages. Compare the complete 11pt detail values,
# excluding repeated 18pt continuation headers, 10pt labels and 7/8pt footers.
# Otherwise page furniture would interrupt a correctly preserved long criterion.
detail_values = []
def detail_text(value, _cm, _tm, _font, size):
    if abs(size - 11) < 0.01:
        detail_values.append(value)
for page in reader.pages[1:]:
    page.extract_text(visitor_text=detail_text)
text = " ".join(" ".join(detail_values).split())
for field in ["recipient", "issuer", "achievement", "exam", "criteria"]:
    assert " ".join(claims[field].split()) in text, f"Missing complete certificate field: {field}"
if "replaces_certificate_id" in claims:
    assert claims["replaces_certificate_id"] in text, "Missing signed predecessor on replacement PDF"
download = path.parent / ("replacement-certificate.json" if path.name.startswith("replacement-") else "candidate-certificate.json")
if download.exists():
    assert certificate == json.loads(download.read_text(encoding="utf-8")), "PDF credential differs from downloaded signed JSON"
links = [entry.get_object()["/A"]["/URI"] for entry in reader.pages[0].get("/Annots", []) if entry.get_object().get("/Subtype") == "/Link"]
assert len(links) == 1
# Bind raster output to these exact PDF bytes. Reusing a stable prefix would
# mix stale pages when a newer layout has fewer pages than its prior version.
document_hash = hashlib.sha256(path.read_bytes()).hexdigest()
prefix = path.with_suffix("").with_name(path.stem + ".page-" + document_hash[:16])
subprocess.run([os.environ.get("PDFTOPPM", "pdftoppm"), "-r", "144", "-png", str(path), str(prefix)], check=True, timeout=30, capture_output=True)
images = sorted(path.parent.glob(prefix.name + "-*.png"))
assert len(images) == len(reader.pages)
print(json.dumps({"pages": len(reader.pages), "url": links[0], "certificate": certificate, "claims": claims, "first_image": str(images[0]), "sha256": document_hash, "matches_download": download.exists()}))
