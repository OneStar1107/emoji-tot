# EmojiTot repository instructions

## Release cleanup on Windows

After every successful EmojiTot update or release, finish the installation on the
same Windows computer before reporting completion:

1. Verify the newly installed executable reports the expected full version.
2. Keep the current install directory and all user data, including preferences,
   state, shelf contents, and todo/focus data.
3. Close only processes whose executable is under EmojiTot install paths.
4. Remove obsolete EmojiTot install directories, old portable/installer builds,
   and regenerable runtime/browser caches.
5. Preserve the current release assets and installed runtime. Never delete an
   unresolved glob, the workspace root, a home directory, or the current install.
6. Relaunch or verify the current version and report what was removed, its size,
   and whether removal is recoverable.

See `docs/RELEASING.md` for the concrete cleanup checklist and protected paths.
