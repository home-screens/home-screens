import { FamilyError } from '@/lib/family-errors';
import { validateTodoData } from '@/lib/todo-data';
import { missingAssignment, recordLabel, rows, stripIds, type Doc, type MemberReferenceDomain, type RestorePlan } from './contract';

/**
 * Shared lists: an item may carry `assigneeIds`. Removal takes the person
 * off every item; the item itself stays, because it is the list's, not the
 * person's. Restore refuses an item that names a missing person.
 */
export const todoReferences: MemberReferenceDomain = {
  path: 'data/todos.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const next = structuredClone(doc);
    if (!Array.isArray(next.lists)) throw new FamilyError('family.dataInvalid', 'The saved lists are invalid.', { status: 409 });
    next.lists = next.lists.map((list: Doc) => {
      if (!Array.isArray(list.items)) throw new FamilyError('family.dataInvalid', 'The saved list items are invalid.', { status: 409 });
      return { ...list, items: list.items.map((item: Doc) => ({ ...item, ...(item.assigneeIds !== undefined ? { assigneeIds: stripIds(item.assigneeIds, removed) } : {}) })) };
    });
    return next;
  },
  planRestore(doc, members): RestorePlan {
    const invalid = validateTodoData(doc);
    if (invalid) throw new Error(invalid);
    const missing: string[] = [];
    for (const [listIndex, list] of rows(doc.lists, 'To-do lists').entries()) {
      const listLabel = recordLabel('data/todos.json', `lists[${listIndex}]`, list);
      for (const [itemIndex, item] of rows(list.items, 'To-do items').entries()) {
        if (item.assigneeIds !== undefined) missing.push(...missingAssignment(item.assigneeIds, `${recordLabel(listLabel, `items[${itemIndex}]`, item)}, assigneeIds`, members));
      }
    }
    return { missing, evidence: {} };
  },
};
