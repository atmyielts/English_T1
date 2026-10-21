"""Fast boundary tests; not a substitute for real decoder/AV corpus tests."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from decoder import decode, Rejected


class TimingPolicy(unittest.TestCase):
    def run_case(self, duration="1", progress="out_time_us=1000000\nprogress=end\n", mime="audio/wav", failure=False):
        probe={"format":{"format_name":"wav" if mime=="audio/wav" else "matroska,webm"},"streams":[{"codec_type":"audio","codec_name":"opus"}]}
        if duration is not None:
            probe["format"]["duration"]=duration
        def command(args, **options):
            if args[0]=="ffprobe":
                return json.dumps(probe).encode()
            self.assertEqual(args[0],"ffmpeg")
            self.assertIn("-xerror",args)
            self.assertEqual(args[-3:],["-f","null","-"])
            if failure:
                raise Rejected("decoder_failed")
            return progress.encode()
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            source=Path(directory)/"synthetic-header"
            source.write_bytes(b"not an actual codec; native decoding is tested separately")
            with patch("decoder.command",command),patch("decoder.webm_header",return_value=True):
                return decode(source,mime)

    def test_complete_positive_output(self):
        self.assertEqual(self.run_case(),"audio/wav")

    def test_streamed_webm_without_duration_header(self):
        self.assertEqual(self.run_case(duration=None,mime="audio/webm"),"audio/webm")

    def test_missing_duration_is_not_a_blanket_format_bypass(self):
        with self.assertRaises(Rejected):
            self.run_case(duration=None)

    def test_invalid_or_over_limit_header(self):
        for value in ["nan","inf","-1","0","21600.001"]:
            with self.subTest(value=value),self.assertRaises(Rejected):
                self.run_case(duration=value)

    def test_invalid_or_over_limit_decoded_output(self):
        for progress in ["progress=end\n","out_time_us=N/A\nprogress=end\n","out_time_us=0\nprogress=end\n","out_time_us=-1\nprogress=end\n","out_time_us=21600000001\nprogress=end\n","out_time_us=1000000\nprogress=continue\n"]:
            with self.subTest(progress=progress),self.assertRaises(Rejected):
                self.run_case(progress=progress)

    def test_late_bad_output_cannot_hide_behind_valid_header(self):
        with self.assertRaises(Rejected):
            self.run_case(progress="out_time_us=21600000001\nprogress=continue\nout_time_us=1000000\nprogress=end\n")

    def test_decode_errors_fail_even_with_valid_duration(self):
        with self.assertRaises(Rejected):
            self.run_case(failure=True)

    def test_exact_safety_ceiling(self):
        self.assertEqual(self.run_case(duration="21600",progress="out_time_us=21600000000\nprogress=end\n"),"audio/wav")


if __name__=="__main__":
    unittest.main(verbosity=2)
