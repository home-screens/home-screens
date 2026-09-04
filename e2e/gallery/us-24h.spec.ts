import { runGallery } from './run';

// One file per scenario so the set runs on separate workers: the suite is
// files-parallel and tests-sequential-within-a-file (playwright.config.ts).
runGallery('us-24h');
