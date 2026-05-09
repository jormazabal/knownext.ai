# Third-Party Notices

KnowNext.ai depends on third-party open source software from the JavaScript,
Rust, and Python ecosystems. Third-party dependencies are not relicensed by
this repository; each dependency remains available under its own license.

## Dependency License Review

Review date: 2026-05-09

Project license: Apache-2.0

No dependency reviewed in the current lockfiles was identified as GPL, AGPL, or
otherwise incompatible with distributing KnowNext.ai under Apache-2.0.

Observed dependency license families:

- JavaScript: MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, MIT-0,
  CC-BY-4.0, and MPL-2.0-or-Apache-2.0 alternatives.
- Rust: MIT, Apache-2.0, BSD-3-Clause, ISC, MPL-2.0, Unicode-3.0, Zlib,
  Unlicense, CDLA-Permissive-2.0, and dual-license alternatives that include
  MIT or Apache-2.0.
- Python: FastAPI, Uvicorn, Pydantic, HTTPX, Pytest, Starlette, and AnyIO are
  distributed under permissive licenses such as MIT or BSD.

Notable review decisions:

- `r-efi` offers `MIT OR Apache-2.0 OR LGPL-2.1-or-later`; KnowNext.ai relies
  on the permissive MIT/Apache option.
- DOMPurify is reported by npm as `MPL-2.0 OR Apache-2.0`; KnowNext.ai relies
  on the Apache-2.0 option.
- Rust crates reported as MPL-2.0 are third-party dependencies and are not
  modified in this repository.

This file is a practical engineering review, not legal advice. Re-run the
license review before major dependency upgrades or before commercial
redistribution under a different policy.
