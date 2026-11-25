import { describe, it, expect } from 'vitest';
import { googleAccountName, insertInListOrder } from '@/lib/calendar-sources';

describe('insertInListOrder', () => {
  const listed = ['a', 'b', 'c', 'd'];
  const rank = (id: string) => listed.indexOf(id);

  it('puts a calendar ticked again back in its place in the list', () => {
    expect(insertInListOrder(['a', 'c', 'd'], 'b', rank)).toEqual(['a', 'b', 'c', 'd']);
    expect(insertInListOrder(['b', 'c'], 'a', rank)).toEqual(['a', 'b', 'c']);
    expect(insertInListOrder(['a', 'b'], 'd', rank)).toEqual(['a', 'b', 'd']);
  });

  it('keeps the order already there, and adds one the list does not hold at the end', () => {
    expect(insertInListOrder(['d', 'a'], 'b', rank)).toEqual(['b', 'd', 'a']);
    expect(insertInListOrder(['a', 'x'], 'c', rank)).toEqual(['a', 'x', 'c']);
    expect(insertInListOrder(['a', 'b'], 'zz', rank)).toEqual(['a', 'b', 'zz']);
  });
});

describe('googleAccountName', () => {
  it('names a person\'s own calendar by the part of its address before the @', () => {
    expect(googleAccountName('sam.rivera@gmail.com')).toBe('sam.rivera');
    expect(googleAccountName('jo@school.example.org')).toBe('jo');
  });

  it('has no name for an id that is a code, so the editor never shows one', () => {
    expect(googleAccountName('primary')).toBeUndefined();
    expect(googleAccountName('family')).toBeUndefined();
    expect(googleAccountName('c_4f1b2e9a7d3c4b8e9f0a1b2c3d4e5f60@group.calendar.google.com')).toBeUndefined();
    expect(googleAccountName('3k9f8sdf98sdf7s9d8f7sd9f8a@group.calendar.google.com')).toBeUndefined();
    expect(googleAccountName('en.usa#holiday@group.v.calendar.google.com')).toBeUndefined();
    expect(googleAccountName('addressbook#contacts@group.v.calendar.google.com')).toBeUndefined();
    expect(googleAccountName('abc123@import.calendar.google.com')).toBeUndefined();
    expect(googleAccountName('@gmail.com')).toBeUndefined();
    expect(googleAccountName('sam@')).toBeUndefined();
  });
});
