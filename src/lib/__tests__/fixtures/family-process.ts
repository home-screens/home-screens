/** Separate process used to test real kernel locks and abrupt journal recovery. */
import { promises as fs } from 'node:fs';
import { familyRevision, readFamilyData, replaceFamilyMembers, settleFamilyMigration } from '../../family-data';
import { commitDataTransaction, readTransactionFile, withDataTransaction } from '../../data-transaction';

const directory = process.argv[2];
const action = process.argv[3];
const stage = process.argv[4];
process.chdir(directory);

async function main() {
  if (action === 'hold') {
    await withDataTransaction(async () => {
      process.stdout.write('locked\n');
      await new Promise<void>(() => { setInterval(() => {}, 1000); });
    });
  } else if (action === 'stall') {
    // Holds the lock, then publishes only when told to, so a test can stop
    // this process long enough for someone else to take the lock over.
    await withDataTransaction(async () => {
      process.stdout.write('held\n');
      // Destroy, or the stdin pipe keeps this process alive after it is done.
      await new Promise<void>((resolve) => process.stdin.once('data', () => { process.stdin.destroy(); resolve(); }));
      const before = await readTransactionFile('data/count.json');
      await commitDataTransaction({ kind: 'count', changes: [{ path: 'data/count.json', before, after: '1' }] });
      process.stdout.write('published\n');
    });
  } else if (action === 'set') {
    await withDataTransaction(async () => commitDataTransaction({ kind: 'count', changes: [
      { path: 'data/count.json', before: await readTransactionFile('data/count.json'), after: stage },
    ] }));
    process.stdout.write('set\n');
  } else if (action === 'acquire') {
    await withDataTransaction(() => { process.stdout.write('acquired\n'); });
  } else if (action === 'increment') {
    for (let n = 0; n < 5; n++) {
      await withDataTransaction(async () => {
        const before = await readTransactionFile('data/count.json');
        const count = before === null ? 0 : JSON.parse(before);
        await commitDataTransaction({ kind: 'count', changes: [{ path: 'data/count.json', before, after: JSON.stringify(count + 1) }] });
      });
    }
  } else if (action === 'recover-raw') {
    await withDataTransaction(() => {});
  } else if (action === 'restore-crash') {
    const rename = fs.rename.bind(fs);
    let failed = false;
    fs.rename = async (from, to) => {
      if (String(to).endsWith('/c.json') && !failed) { failed = true; throw new Error('restore write failure'); }
      await rename(from, to);
      if (String(to).endsWith('/family-transaction.json')) {
        const journal = JSON.parse(await fs.readFile(to, 'utf8'));
        if (stage === 'rollback-decision' && journal.decision === 'rollback') process.kill(process.pid, 'SIGKILL');
      }
      if (stage === 'rollback-write' && failed && String(to).endsWith('/b.json')) process.kill(process.pid, 'SIGKILL');
    };
    await withDataTransaction(async () => commitDataTransaction({ kind: 'restore', rollbackOnError: true, changes: [
      { path: 'data/a.json', before: await readTransactionFile('data/a.json'), after: '{"new":true}' },
      { path: 'data/b.json', before: await readTransactionFile('data/b.json'), after: '{"new":true}' },
      { path: 'data/c.json', before: null, after: '{}' },
    ] }));
  } else {
    if (action === 'crash' || action === 'delete-crash') {
      const rename = fs.rename.bind(fs);
      fs.rename = async (from, to) => {
        await rename(from, to);
        const target = String(to);
        let hit = false;
        if (stage === 'journal') hit = target.endsWith('/family-transaction.json');
        if (stage === 'evidence') hit = target.endsWith('/family-migration.json');
        if (stage === 'config') hit = target.endsWith('/config.json');
        if (stage === 'chores') hit = target.endsWith('/chores.json');
        if (stage === 'family-pending' || stage === 'family-final') {
          if (target.endsWith('/family.json')) {
            const data = JSON.parse(await fs.readFile(target, 'utf8'));
            hit = data.migrated === (stage === 'family-final');
          }
        }
        if (hit) process.kill(process.pid, 'SIGKILL');
      };
      if (stage === 'remove-journal') {
        const unlink = fs.unlink.bind(fs);
        fs.unlink = async (target) => {
          if (String(target).endsWith('/family-transaction.json')) process.kill(process.pid, 'SIGKILL');
          await unlink(target);
        };
      }
    }
    if (action === 'delete-crash') {
      const data = await readFamilyData();
      await replaceFamilyMembers({ members: data.members.filter((member) => member.id !== 'a'), revision: familyRevision(data), removedIds: ['a'] });
    } else await settleFamilyMigration();
  }
}
main().catch((error: unknown) => { process.stderr.write(String(error)); process.exitCode = 1; });
