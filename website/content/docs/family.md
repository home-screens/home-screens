---
title: Family
nextjs:
  metadata:
    title: Manage your family
    description: Add the people in your household once for chores, rewards and calendars.
    alternates:
      canonical: /docs/family
---

Add your household once. Each person's name, colour and optional icon or emoji follow them across chores, rewards and calendars. You can manage your family even if you do not use a chore chart. {% .lead %}

## Add or edit someone

In the editor, open **Settings > Family** under Content. On a phone, open `/remote`, tap **Settings**, then **Family**. The Members section in a chore chart uses the same list.

Choose **Add person**, enter a name, choose a colour and an optional icon, then **Save**. You can also type an emoji instead of choosing an icon. On a phone, the form opens full screen with large colour swatches; leaving an edited form asks before discarding your changes. Use the pencil to edit someone or the arrows to reorder the list. Changes are shared with the other displays and phones.

You can add up to 64 people. Larger lists brought forward from an older version are kept in full and split into pages. You can still edit, reorder or remove those people.

If someone saves another change while you are editing, the current list appears with a message asking you to make your edit again. This protects changes made on another phone.

## Connect calendars

Open **Settings > Calendar > Whose calendars?** and tick the calendars that belong to each person. A calendar can belong to several people. Calendars assigned to nobody are shared with everyone.

The Full-Screen Calendar's family grid and free time views show people who have at least one calendar assigned. Adding someone to the family without choosing their calendars does not add an empty personal row. Shared events still appear under Everyone in the family grid and count as busy time for every person in the free time view. Add calendar sources first if there are no calendars to choose from. See [Calendars](/docs/calendars).

## Remove someone

Choose the bin beside their name. The confirmation names the person, shows how many chores they are assigned to, and explains what will be deleted: chore assignments and schedules, completion history, ticket balance, reward access and calendar assignments. Chores with no one left assigned are also deleted; chores still assigned to someone else stay. Confirm only when you intend to remove those records.

## After upgrading

Existing chore members keep their identities, so their assignments, tickets and completion history stay connected. Calendar people join the same list. An existing identity is matched first; otherwise a calendar person merges with a single person whose name matches after ignoring case and extra spaces. Two distinct chore members named Alex stay separate. Ambiguous calendar names remain separate as well.

Check **Settings > Family** for the names and colours you want, then check each person's calendars. Existing chore details take precedence when a calendar person joins that identity. No existing person is dropped because the list exceeds 64 people.

Backups include the family list. Restoring an older backup without a family section keeps your current family and adds any legacy identities that are missing.

An older backup can contain reward access for someone who was already removed. Restore clears that person's reward access while preserving ticket balances and history. If a reward has nobody left who can claim it, it is turned off; edit its people and turn it back on when ready. The original reward details are kept in the migration record.

If chore or to-do assignments name people missing from the restored family, restore stops before changing files. The message lists each affected file, record and missing person ID together. Use a backup containing those family records, or remove the listed assignments and try again.
