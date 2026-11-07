"""Focused release gates: no builds, provider access, device access or secrets."""
import importlib.util
import json
import pathlib
import struct
import tempfile
import unittest
from unittest import mock
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("android_release_gate", HERE / "check-android-release.py")
GATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GATE)
BASELINE = json.loads((HERE / "android-release-baseline.json").read_text())
BADGING = "package: name='ai.knownext.mobile' versionCode='3000000' versionName='3.0.0'\nsdkVersion:'24'\ntargetSdkVersion:'36'\nnative-code: 'arm64-v8a'\n"


def elf(api=29, alignment=16384):
    data = bytearray(256)
    data[:6] = b"\x7fELF\x02\x01"
    struct.pack_into("<H", data, 18, 183)
    struct.pack_into("<Q", data, 32, 64)
    struct.pack_into("<HHHH", data, 54, 56, 2, 64, 0)
    struct.pack_into("<IIQQQQQQ", data, 64, 1, 4, 0, 0, 0, 256, 256, alignment)
    struct.pack_into("<IIQQQQQQ", data, 120, 4, 4, 176, 176, 176, 24, 24, 4)
    struct.pack_into("<III", data, 176, 8, 4, 1)
    data[188:196] = b"Android\0"
    struct.pack_into("<I", data, 196, api)
    return bytes(data)


class AndroidReleaseGateTests(unittest.TestCase):
    def test_production_identity_advances_the_real_public_baseline(self):
        value = GATE.check_badging(BADGING, "3.0.0", BASELINE)
        self.assertEqual(value["versionCode"], 3000000)
        self.assertEqual(value["minimumSdk"], 24)
        for modified in [BADGING.replace("ai.knownext.mobile'", "ai.knownext.mobile.v3qa'"), BADGING + "application-debuggable\n", BADGING.replace("sdkVersion:'24'", "sdkVersion:'35'")]:
            with self.assertRaises(ValueError):
                GATE.check_badging(modified, "3.0.0", BASELINE)

    def test_previous_or_wrong_version_cannot_be_published_as_new_release(self):
        with self.assertRaises(ValueError):
            GATE.check_badging(BADGING.replace("3000000", "2006000"), "3.0.0", BASELINE)

    def test_existing_production_certificate_is_mandatory(self):
        signature = "Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: " + BASELINE["certificateSha256"]
        self.assertEqual(GATE.check_signature(signature, BASELINE), BASELINE["certificateSha256"])
        with self.assertRaises(ValueError):
            GATE.check_signature(signature.replace(BASELINE["certificateSha256"], "f" * 64), BASELINE)

    def test_native_minimum_api_and_page_support_are_checked(self):
        self.assertEqual(GATE.verify_native(elf(21), "libcrypto.so", "arm64-v8a", 29)["androidApi"], 21)
        with self.assertRaises(ValueError):
            GATE.verify_native(elf(35), "libcrypto.so", "arm64-v8a", 29)
        with self.assertRaises(ValueError):
            GATE.verify_native(elf(29, 4096), "libcrypto.so", "arm64-v8a", 29)

    def test_wrong_abi_and_missing_native_exports_are_rejected(self):
        with self.assertRaises(ValueError):
            GATE.verify_native(elf(), "libcrypto.so", "x86_64", 29)
        with self.assertRaises(ValueError):
            GATE.verify_native(elf(), "libknownext_proton.so", "arm64-v8a", 29)

    def test_optional_sdk_cannot_be_loaded_at_app_start_on_api24(self):
        unsafe = {"androidApi": 24, "exports": set(), "dependencies": ["libknownext_proton.so"]}
        with mock.patch.object(GATE, "elf_info", return_value=unsafe):
            with self.assertRaisesRegex(ValueError, "lazily"):
                GATE.verify_native(b"input", GATE.APP_LIBRARY, "arm64-v8a", 24)

    def test_missing_sdk_cannot_pass_an_otherwise_existing_apk(self):
        with tempfile.TemporaryDirectory() as folder:
            apk = pathlib.Path(folder) / "missing-sdk.apk"
            with zipfile.ZipFile(apk, "w") as archive:
                archive.writestr("lib/arm64-v8a/libknownext_ai_desktop_lib.so", elf(24))
            receipt = {"libraries": [{"name": name} for name in GATE.PROVIDER_LIBRARIES]}
            with self.assertRaisesRegex(ValueError, "five expected"):
                GATE.check_zip(apk, receipt, apk)

    def test_partial_native_receipt_never_skips_a_library_hash(self):
        with self.assertRaisesRegex(ValueError, "all four"):
            GATE.check_zip("not-opened.apk", {"libraries": []}, "not-opened.so")

    def test_redistribution_notices_are_required(self):
        with tempfile.TemporaryDirectory() as folder:
            native = pathlib.Path(folder) / "native"
            native.mkdir()
            notices = pathlib.Path(folder) / "notices"
            notices.mkdir()
            for name in GATE.PROVIDER_LIBRARIES:
                (native / name).write_bytes(b"native-test-input")
            with mock.patch.object(GATE, "verify_native", return_value={"verified": True}):
                with self.assertRaisesRegex(ValueError, "licenses or provenance"):
                    GATE.native_receipt(native, notices, "arm64-v8a")

    def test_replaced_provider_binary_is_rejected_before_packaging(self):
        with tempfile.TemporaryDirectory() as folder:
            apk = pathlib.Path(folder) / "changed-sdk.apk"
            with zipfile.ZipFile(apk, "w") as archive:
                for name in GATE.PROVIDER_LIBRARIES | {GATE.APP_LIBRARY}:
                    archive.writestr("lib/arm64-v8a/" + name, b"replaced")
            receipt = {"libraries": [{"name": name, "sha256": "0" * 64} for name in GATE.PROVIDER_LIBRARIES]}
            with self.assertRaisesRegex(ValueError, "differs from verified"):
                GATE.check_zip(apk, receipt, apk)


if __name__ == "__main__":
    unittest.main()
