# KnowNext sync folder

Pure local exchange transport. This crate does not authenticate to Proton, start
its client, contact any network service or modify a receiving project. Publishing
acknowledges the **local exchange folder**, not cloud availability.

## API

- `capture(source, project_id, publication_id, sender_id, parent_publication)`
  captures a bounded snapshot. Hidden components and coordination filenames are
  excluded before metadata access; omissions remain in `manifest.exclusions`.
- `restore_snapshot(manifest, contents, source_root)` restores a persisted outbox
  capture, checking every captured size/hash without re-reading the live source.
- `publish(exchange, snapshot)` commits immutable hash-addressed objects, then
  publishes the final descriptor through an atomic create-only operation.
- `inspect(exchange, project_id, publication_id)` parses and validates the
  descriptor. **It does not claim that referenced content has arrived.**
- `read_verified(exchange, manifest)` checks the exact descriptor and all objects,
  returning no content map if any object is absent, truncated or altered.
- `list(exchange, project_id)` lists descriptors within a bounded JSON budget.
- `discover_projects(exchange)` discovers only projects whose published content
  can be verified within its total scan budget. Partial delivery is an explicit
  error, not evidence of an empty exchange.
- `manifest_hash(manifest)` hashes deterministic schema-validated JSON.

Local layout: `objects/<sha256>.blob` and
`projects/<projectId>/publications/<publicationId>.json`. Temporary publications
use `.tmp` and are never considered descriptors. Proton lists `.tmp` among file
types not synchronized by its Windows client:
[official folder support](https://proton.me/support/proton-drive-windows-sync-folder).

Limits: 64 MiB/file, 512 MiB/snapshot, 10,000 files/directories/exclusions,
8 MiB descriptor/list JSON budget; discovery additionally caps 128 projects and
512 MiB/10,000 referenced files per scan. Over-budget inventories fail explicitly.

Windows commit uses `MoveFileExW` with write-through and without replacement.
Other platforms use a same-directory hard link that also fails if occupied.
Preexisting matching data may be reused; unknown/different data is preserved.
Local source/private ancestors are strictly regular; all reparse points remain
rejected there. Exchange-only ancestors and objects additionally accept the exact
Windows `IO_REPARSE_TAG_CLOUD` / `_1`–`_F` tags. `FindFirstFileW` reads the path tag;
opened content is rechecked through `GetFileInformationByHandleEx` /
`FileAttributeTagInfo`. Name-surrogate, symlink, junction and unknown tags remain
rejected. Other reparse types are not allowed merely because they lack the
name-surrogate bit. The API is `regular_exchange_directory`; callers must not
replace private/source guards with it.

References: [Microsoft reparse tags](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-point-tags),
[tag values](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-fscc/c8e77b37-3909-4fe6-a4ea-2b9d423b1ee4),
[FILE_ATTRIBUTE_TAG_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_attribute_tag_info).

This compatibility policy has focused classifier tests; actual CFAPI placeholder
hydration and Proton-client behavior still require native installed acceptance.
The implementation does not hydrate proactively, pin files, or claim offline
availability. Reads may require the external provider to retrieve content and fail
without it; hashes/size and complete-inventory requirements still apply.

The caller must still coordinate cooperating local writers and revalidate the
receiving worktree immediately before its own apply; this is not a filesystem
sandbox against arbitrary hostile local processes racing directory replacement.

The tests that copy objects between two exchange directories model unordered
transport and corruption. They are **not acceptance of the actual Proton client,
network synchronization, Android compatibility or cloud acknowledgement**.
