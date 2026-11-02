import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { todoWrite } from '../todo-api';
import { addItem, updateItem } from '../todo-data';
import type { TodoData, TodoList } from '@/types/todos';

let root: string;
const todosPath = () => path.join(root, 'data', 'todos.json');
const familyPath = () => path.join(root, 'data', 'family.json');
const member = (id: string, name: string) => ({ id, name, color: '#60a5fa', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' });

function list(): TodoList {
  return {
    id: 'l1',
    name: 'Groceries',
    slug: 'groceries',
    items: [{ id: 'i1', text: 'Milk', completed: false, createdAt: '2026-10-01T00:00:00.000Z' }],
    repeat: 'never',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hs-todo-api-'));
  await fs.mkdir(path.join(root, 'data'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await fs.writeFile(familyPath(), JSON.stringify({ members: [member('mom', 'Mom')], migrated: true }));
  await fs.writeFile(todosPath(), JSON.stringify({ lists: [list()], migratedFromConfig: true } satisfies TodoData));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

const saved = async () => JSON.parse(await fs.readFile(todosPath(), 'utf-8')) as TodoData;

describe('todoWrite assignees', () => {
  it('assigns someone in the family', async () => {
    const res = await todoWrite((data) => updateItem(data, 'l1', 'i1', { assigneeIds: ['mom'] }), undefined, { assigneeIds: ['mom'] });
    expect(res.status).toBe(200);
    expect((await saved()).lists[0].items[0].assigneeIds).toEqual(['mom']);
  });

  // A phone still holding the old roster would otherwise store an id that
  // makes every later backup refuse to restore.
  it('refuses an edit that assigns someone who was removed, and writes nothing', async () => {
    const raw = await fs.readFile(todosPath(), 'utf-8');
    const res = await todoWrite((data) => updateItem(data, 'l1', 'i1', { assigneeIds: ['mom', 'gone'] }), undefined, { assigneeIds: ['mom', 'gone'] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Someone in this selection was removed. Refresh and choose again.', reason: 'member' });
    expect(await fs.readFile(todosPath(), 'utf-8')).toBe(raw);
  });

  it('refuses a new item for someone who was removed', async () => {
    const res = await todoWrite((data) => addItem(data, 'l1', { text: 'Eggs', assigneeIds: ['gone'] }).data, undefined, { assigneeIds: ['gone'] });
    expect(res.status).toBe(409);
    expect((await saved()).lists[0].items).toHaveLength(1);
  });

  it('clears assignees without asking the family', async () => {
    await fs.rm(familyPath());
    const res = await todoWrite((data) => updateItem(data, 'l1', 'i1', { assigneeIds: [] }), undefined, { assigneeIds: [] });
    expect(res.status).toBe(200);
  });

  it("leaves a value that is not a list of ids to the action's own refusal", async () => {
    const res = await todoWrite((data) => updateItem(data, 'l1', 'i1', { assigneeIds: 'mom' }), undefined, { assigneeIds: 'mom' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'People must be a list of ids' });
  });
});
