import { ALL_EMOJIS, EMOJI_GROUPS, searchEmojis } from '../emoji-data';

describe('emoji-data', () => {
  it('flattens every group into ALL_EMOJIS', () => {
    const total = EMOJI_GROUPS.reduce((n, g) => n + g.emojis.length, 0);
    expect(ALL_EMOJIS.length).toBe(total);
    expect(ALL_EMOJIS.length).toBeGreaterThan(200);
  });

  it('every entry carries at least one search keyword', () => {
    for (const e of ALL_EMOJIS) {
      expect(e.keywords.length).toBeGreaterThan(0);
      expect(e.char).toBeTruthy();
    }
  });

  it('returns the full set for an empty query', () => {
    expect(searchEmojis('')).toHaveLength(ALL_EMOJIS.length);
    expect(searchEmojis('   ')).toHaveLength(ALL_EMOJIS.length);
  });

  it('finds emoji by keyword, case-insensitively', () => {
    const money = searchEmojis('money').map((e) => e.char);
    expect(money).toContain('💰');
    expect(money).toContain('💵');

    const cat = searchEmojis('CAT').map((e) => e.char);
    expect(cat).toContain('🐱');
  });

  it('matches keyword prefixes (partial words)', () => {
    const mon = searchEmojis('mon').map((e) => e.char);
    expect(mon).toContain('💰'); // "money"
  });

  it('requires all terms to match (AND semantics)', () => {
    // "red heart" should match ❤️ (name "red heart") but not the cat.
    const results = searchEmojis('red heart').map((e) => e.char);
    expect(results).toContain('❤️');
    expect(results).not.toContain('🐱');
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchEmojis('zzzznotanemoji')).toHaveLength(0);
  });

  it('does not return duplicate glyphs', () => {
    const chars = searchEmojis('heart').map((e) => e.char);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it('de-duplicates a glyph that appears in more than one group', () => {
    // 🏠 is listed twice in the data: once under "Travel & places"
    // (keywords house/home) and once under "Symbols & finance"
    // (keywords home/house/dashboard). It should be a genuine duplicate in the
    // flat list, but searchEmojis must collapse it to a single result.
    const houseInAll = ALL_EMOJIS.filter((e) => e.char === '🏠');
    expect(houseInAll.length).toBeGreaterThan(1);

    const houseResults = searchEmojis('house').filter((e) => e.char === '🏠');
    expect(houseResults).toHaveLength(1);
  });

  it('matches keywords anywhere in the token, not only as a prefix', () => {
    // "savings" is a keyword on the money bag; an interior substring should
    // still match (the matcher uses includes(), not startsWith()).
    const aving = searchEmojis('aving').map((e) => e.char);
    expect(aving).toContain('💰');
  });

  it('trims and collapses surrounding/interior whitespace in the query', () => {
    const messy = searchEmojis('   red    heart   ').map((e) => e.char);
    const clean = searchEmojis('red heart').map((e) => e.char);
    expect(messy).toEqual(clean);
    expect(messy).toContain('❤️');
  });

  it('returns nothing when any single term of a multi-term query fails to match', () => {
    // "red" matches ❤️, but the second (nonsense) term must veto it (AND).
    expect(searchEmojis('red zzzznotanemoji')).toHaveLength(0);
  });
});
