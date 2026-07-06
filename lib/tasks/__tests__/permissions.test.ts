import { canEdit, canView, isOwner } from '../permissions';

const owner = 'user-owner';
const editor = 'user-editor';
const reader = 'user-reader';
const stranger = 'user-stranger';

const task = {
  ownerId: owner,
  shares: [
    { userId: editor, canEdit: true },
    { userId: reader, canEdit: false },
  ],
};

describe('Tasks permission helpers', () => {
  it('isOwner is true only for the ownerId', () => {
    expect(isOwner(task, owner)).toBe(true);
    expect(isOwner(task, editor)).toBe(false);
    expect(isOwner(task, reader)).toBe(false);
    expect(isOwner(task, stranger)).toBe(false);
  });

  it('canView is true for owner, editor, and read-only sharee', () => {
    expect(canView(task, owner)).toBe(true);
    expect(canView(task, editor)).toBe(true);
    expect(canView(task, reader)).toBe(true);
    expect(canView(task, stranger)).toBe(false);
  });

  it('canEdit is true for owner + shared-editor, false for read-only sharee', () => {
    expect(canEdit(task, owner)).toBe(true);
    expect(canEdit(task, editor)).toBe(true);
    expect(canEdit(task, reader)).toBe(false);
    expect(canEdit(task, stranger)).toBe(false);
  });

  it('handles missing shares array', () => {
    const lone = { ownerId: owner };
    expect(canView(lone, owner)).toBe(true);
    expect(canView(lone, stranger)).toBe(false);
    expect(canEdit(lone, owner)).toBe(true);
    expect(canEdit(lone, stranger)).toBe(false);
  });
});
