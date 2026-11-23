# Config migrations

Detail for writing a migration or cutting a release; the root `CLAUDE.md` says when a change needs a migration and what a bump touches.

## Release markers and update floors

Releases carry two HTML-comment markers in their GitHub body, stamped by `scripts/release.sh` from code: `home-screens-schema` (the newest schema this release reads, from `getLatestSchemaVersion()`) and `home-screens-requires` (`REQUIRED_FLOORS` in the migrations module, empty until a release drops old migrations). `src/lib/update-policy.ts` turns them into what the update check offers and what `runUpgrade` refuses: a device below a floor is sent to the floor first, and a step back to a release whose schema is below the saved config's is withheld. The pipeline's migrate step in `src/lib/upgrade.ts` is the last place this release's migrations run before the new tree takes over, so any new lazy host migration must be settled there too.
