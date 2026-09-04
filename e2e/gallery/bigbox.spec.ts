import { runGallery } from './run';

// One file per scenario so the five run on separate workers: the suite is
// files-parallel and tests-sequential-within-a-file (playwright.config.ts).
runGallery('bigbox');
