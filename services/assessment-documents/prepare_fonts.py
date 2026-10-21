"""Deterministically instance licensed source fonts; never edit mother assets."""
from pathlib import Path
import hashlib
from io import BytesIO
import json
import sys

directory = Path(__file__).resolve().parent
check_only = "--check" in sys.argv
if (directory / ".font-tools").exists():
    sys.path.insert(0, str(directory / ".font-tools"))
import fontTools
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

assert fontTools.__version__ == "4.67.0", "Use the pinned document font build tooling"
root = directory.parents[1]
sources = [
    (root / "packages/service-design/assets/Manrope-Variable.ttf", "Certificate-Manrope-Regular.ttf", "SchoodCertificateManrope", "Regular", 400),
    (root / "packages/service-design/assets/Sora-Variable.ttf", "Certificate-Sora-Semibold.ttf", "SchoodCertificateSora", "Semibold", 600),
    (directory / "assets/NotoSans-Variable.ttf", "Certificate-Noto-Regular.ttf", "SchoodCertificateNoto", "Regular", 400),
]
manifest = []
for source, name, family, style, weight in sources:
    font = TTFont(str(source), recalcTimestamp=False)
    axes = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
    axes["wght"] = weight
    font = instantiateVariableFont(font, axes, inplace=True)
    assert "fvar" not in font
    # Derived font names avoid claiming the instances are upstream releases.
    names = {1: family, 2: style, 3: family + "-" + style, 4: family + " " + style, 6: family + "-" + style, 16: family, 17: style, 21: family, 22: style}
    for record in font["name"].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    for character in "wWxX":
        glyph = font["glyf"][font.getBestCmap()[ord(character)]]
        assert glyph.numberOfContours != 0, "Missing visible glyph outline"
    destination = directory / "assets" / name
    font.recalcTimestamp = False
    generated = BytesIO()
    font.save(generated, reorderTables=True)
    content = generated.getvalue()
    if check_only:
        assert destination.read_bytes() == content, "Static font differs from its pinned source/build"
    else:
        destination.write_bytes(content)
    manifest.append({"file": name, "sha256": hashlib.sha256(content).hexdigest(), "source": source.relative_to(root).as_posix(), "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "axes": axes, "fonttools": fontTools.__version__})
manifest_path = directory / "assets/font-instances.json"
manifest_content = json.dumps(manifest, indent=2) + "\n"
if check_only:
    assert json.loads(manifest_path.read_text(encoding="utf-8")) == manifest, "Font provenance manifest differs"
else:
    manifest_path.write_text(manifest_content, encoding="utf-8")
print(json.dumps({"font_instances": len(manifest), "fonttools": fontTools.__version__, "verified_without_writes": check_only}))
