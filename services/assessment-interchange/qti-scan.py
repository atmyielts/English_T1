"""Networkless exact-byte QTI inspection; no authority/upload credentials."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, '/app')
from scanner import signature_status

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--expected-hash',required=True)
    args=parser.parse_args()
    if len(args.expected_hash)!=64 or any(char not in '0123456789abcdef' for char in args.expected_hash):
        raise ValueError('source_hash_required')
    source=Path('/tmp/source.zip')
    size=0
    with source.open('wb') as output:
        while chunk:=sys.stdin.buffer.read(1048576):
            size+=len(chunk)
            if size>64*1048576:
                raise ValueError('source_size_limit')
            output.write(chunk)
    size=source.stat().st_size
    if not 22<=size<=64*1048576:
        raise ValueError('source_size_limit')
    signatures=signature_status(Path('/signatures'))
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    if before!=args.expected_hash:
        verdict={'verdict':'rejected','scan_performed':False,'reason':'source_hash_mismatch'}
    else:
        result=subprocess.run(['clamscan','--database=/signatures','--official-db-only=yes','--max-filesize=64M','--max-scansize=128M','--alert-exceeds-max=yes','--alert-encrypted=yes','--max-recursion=20','--max-files=10000','--',str(source)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=150,check=False,env={'PATH':'/usr/bin:/bin','LC_ALL':'C','HOME':'/tmp'})
        if result.returncode not in (0,1) or result.returncode==0 and b'Scanned files: 1' not in result.stdout:
            raise ValueError('antivirus_failed_or_skipped')
        verdict={'verdict':'clean' if result.returncode==0 else 'rejected','scan_performed':True,'reason':'clean' if result.returncode==0 else 'malware_or_engine_limit'}
    if hashlib.sha256(source.read_bytes()).hexdigest()!=before:
        raise ValueError('source_changed_during_scan')
    receipt={'schema_version':'assessment.qti-scan.v2','source_hash':args.expected_hash,'observed_source_hash':before,'byte_length':size,**signatures,**verdict}
    receipt['report_hash']=hashlib.sha256(json.dumps(receipt,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    print(json.dumps(receipt))

try:
    main()
except Exception:
    print(json.dumps({'error':'qti_scan_operational_failure'}))
    raise SystemExit(2)
