"""Leased artifact scanner. Never approves questions or exposes an unauthenticated API."""
import argparse
from datetime import datetime
import hashlib
import json
import os
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

class ScannerFailure(Exception):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Scanner credentials and leases never follow a redirect to another host.
        raise ScannerFailure("scanner_redirect_denied")

def open_request(request, timeout=30):
    return urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout)

def sha(value):
    return hashlib.sha256(value).hexdigest()

def antivirus(path, database):
    command = ["clamscan", "--database=" + str(database), "--official-db-only=yes", "--max-filesize=2048M", "--max-scansize=4096M", "--alert-exceeds-max=yes", "--alert-encrypted=yes", "--max-recursion=20", "--max-files=1000", "--", str(path)]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600, check=False, env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "HOME": "/tmp"})
    if result.returncode == 1:
        return False
    if result.returncode != 0 or b"Scanned files: 1" not in result.stdout:
        raise ScannerFailure("antivirus_failed_or_skipped")
    return True

def inspect_file(path, mime, database):
    if not antivirus(path, database):
        return {"verdict": "rejected", "detected_mime": "application/octet-stream", "decoder_checked": False, "reason": "malware_or_engine_limit"}
    result = subprocess.run(["python3", "/app/decoder.py", str(path), mime], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=660, check=False, env={"PATH": "/usr/bin:/bin", "LC_ALL": "C", "HOME": "/tmp"})
    if result.returncode:
        return {"verdict": "rejected", "detected_mime": "application/octet-stream", "decoder_checked": False, "reason": "decoder_or_policy_rejection"}
    decoded = json.loads(result.stdout)
    if decoded.get("decoder_checked") is not True or decoded.get("detected_mime") != mime:
        raise ScannerFailure("invalid_decoder_receipt")
    return {"verdict": "clean", **decoded}

def isolated(args, database, file=None):
    """Native decoders/AV get no network, authority secrets, parent /proc or socket."""
    image = os.environ.get("ASSESSMENT_SCANNER_IMAGE", "schood-assessment-scanner-local")
    database = Path(database).resolve(strict=True)
    if not database.is_dir() or "," in str(database):
        raise ScannerFailure("invalid_signature_mount")
    command = ["docker", "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "64", "--memory", "4g", "--cpus", "2", "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m", "--mount", "type=bind,src=" + str(database) + ",dst=/signatures,readonly", "--entrypoint", "python3"]
    if hasattr(os, "getuid"):
        command += ["--user", str(os.getuid()) + ":" + str(os.getgid())]
    if file is not None:
        file = Path(file).resolve(strict=True)
        if not file.is_file() or "," in str(file):
            raise ScannerFailure("invalid_artifact_mount")
        command += ["--mount", "type=bind,src=" + str(file) + ",dst=/work/artifact,readonly"]
    command += [image, "/app/scanner.py", *args]
    result = subprocess.run(command, capture_output=True, timeout=900, check=False)
    if result.returncode:
        raise ScannerFailure("isolated_scan_failed")
    if len(result.stdout) > 100000:
        raise ScannerFailure("isolated_receipt_limit")
    return json.loads(result.stdout)

def signature_status(database):
    files = [p for p in Path(database).iterdir() if p.name in {"main.cvd", "main.cld", "daily.cvd", "daily.cld", "bytecode.cvd", "bytecode.cld"}]
    if not any(p.name.startswith("main.") for p in files) or not any(p.name.startswith("daily.") for p in files):
        raise ScannerFailure("official_signatures_required")
    digest = hashlib.sha256()
    for file in sorted(files):
        info = subprocess.run(["sigtool", "--info", str(file)], capture_output=True, timeout=120, check=False)
        output = info.stdout.decode("utf-8", "replace")
        if info.returncode or "Verification OK." not in output:
            raise ScannerFailure("signature_verification_failed")
        if file.name.startswith("daily."):
            date = next((line.split(":", 1)[1].strip() for line in output.splitlines() if line.startswith("Build time:")), "")
            built = datetime.strptime(date, "%d %b %Y %H:%M %z").timestamp()
            if not -300 <= time.time() - built <= 172800:
                raise ScannerFailure("fresh_signatures_required")
        digest.update(file.name.encode())
        with file.open("rb") as source:
            while chunk := source.read(1048576):
                digest.update(chunk)
    version = subprocess.run(["clamscan", "--version"], capture_output=True, timeout=20, check=True).stdout.decode().strip()
    return {"engine_version": version, "signature_version": digest.hexdigest()}

class Client:
    def __init__(self):
        self.secret = os.environ["ASSESSMENT_SCANNER_SECRET"]
        self.identity = os.environ["ASSESSMENT_SCANNER_ID"]
        self.api = self.endpoint(os.environ["ASSESSMENT_API_URL"])
        self.media = self.endpoint(os.environ["ASSESSMENT_MEDIA_URL"])
        self.database = Path(os.environ.get("CLAMAV_DATABASE", "/var/lib/clamav"))
        self.signature_version = self.signatures()
        if len(self.secret) < 32 or not self.identity:
            raise ScannerFailure("invalid_scanner_configuration")

    def endpoint(self, value):
        parsed = urllib.parse.urlsplit(value)
        loopback = parsed.hostname in {"localhost", "127.0.0.1", "host.docker.internal"}
        if not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or (parsed.scheme != "https" and not (parsed.scheme == "http" and loopback and os.environ.get("SCANNER_ALLOW_LOOPBACK_HTTP") == "true")):
            raise ScannerFailure("https_endpoint_required")
        return value.rstrip("/")

    def signatures(self):
        status = isolated(["--signature-status", "/signatures"], self.database)
        self.engine_version = status["engine_version"]
        return status["signature_version"]

    def call(self, path, value):
        request = urllib.request.Request(self.api + "/artifacts/scan/" + path, data=json.dumps(value).encode(), headers={"Content-Type": "application/json", "x-assessment-scanner-key": self.secret})
        with open_request(request) as response:
            body = response.read(2000001)
        if len(body) > 2000000:
            raise ScannerFailure("scan_metadata_limit")
        return json.loads(body)["data"]

    def process(self, ticket):
        stopped = threading.Event()
        failed = []
        def renew():
            while not stopped.wait(40):
                try:
                    self.call("renew", {"job_id": ticket["job_id"], "lease_token": ticket["lease_token"]})
                except Exception:
                    failed.append(True)
                    return
        thread = threading.Thread(target=renew, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="schood-scan-") as directory:
                path = Path(directory) / "artifact"
                request = urllib.request.Request(self.media + "/internal/scan/" + ticket["job_id"] + "?" + urllib.parse.urlencode({"lease_token": ticket["lease_token"]}), headers={"x-assessment-scanner-key": self.secret})
                total = 0
                index = 0
                with open_request(request) as response, path.open("wb") as target:
                    while True:
                        expected = ticket["parts"][index] if index < len(ticket["parts"]) else None
                        if expected is None:
                            if response.read(1):
                                raise ScannerFailure("unexpected_trailing_bytes")
                            break
                        content = bytearray()
                        while len(content) < expected["byte_length"]:
                            chunk = response.read(expected["byte_length"] - len(content))
                            if not chunk:
                                raise ScannerFailure("download_truncated")
                            content.extend(chunk)
                        if sha(content) != expected["sha256"]:
                            raise ScannerFailure("download_hash_mismatch")
                        target.write(content)
                        total += len(content)
                        if total > ticket["byte_length"] or total > 2147483648 or failed:
                            raise ScannerFailure("download_size_or_lease_failure")
                        index += 1
                if total != ticket["byte_length"]:
                    raise ScannerFailure("download_size_mismatch")
                verdict = isolated(["--inspect", "/work/artifact", "--mime", ticket["mime"], "--database", "/signatures"], self.database, path)
                if failed:
                    raise ScannerFailure("lease_renewal_failed")
                report = {"job_id": ticket["job_id"], "lease_token": ticket["lease_token"], "manifest_hash": ticket["manifest_hash"], "scanner_id": self.identity, "scanner_version": verdict["engine_version"][:120], "signature_version": verdict["signature_version"], "report_hash": sha(json.dumps(verdict, sort_keys=True).encode()), **{k: verdict[k] for k in ("verdict", "detected_mime", "decoder_checked")}}
                # Preserve the exact report through uncertain replies. A lease
                # expires/reclaims if all attempts fail; no caller marks it clean.
                for attempt in range(3):
                    try:
                        return self.call("report", report)
                    except Exception:
                        if attempt == 2:
                            raise
                        time.sleep(1)
        finally:
            stopped.set()
            thread.join(timeout=35)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--inspect")
    parser.add_argument("--mime")
    parser.add_argument("--database")
    parser.add_argument("--signature-status")
    args = parser.parse_args()
    if args.signature_status:
        print(json.dumps(signature_status(args.signature_status)))
        return
    if args.inspect:
        before = signature_status(args.database)
        verdict = inspect_file(Path(args.inspect), args.mime, Path(args.database))
        if before != signature_status(args.database):
            raise ScannerFailure("signatures_changed_during_scan")
        print(json.dumps({**verdict, **before}))
        return
    client = Client()
    while True:
        client.signature_version = client.signatures()
        jobs = client.call("claim", {"limit": 1})
        for job in jobs:
            try:
                result = client.process(job)
                print(json.dumps({"event": "artifact.scan", "state": result["state"]}), flush=True)
            except Exception:
                print(json.dumps({"event": "artifact.scan", "state": "retry_required"}), flush=True)
                if args.once:
                    raise ScannerFailure("scan_failed") from None
        if args.once:
            return
        time.sleep(5 if not jobs else 1)

if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"event": "artifact.scan", "state": "operational_failure"}), flush=True)
        raise SystemExit(1) from None
