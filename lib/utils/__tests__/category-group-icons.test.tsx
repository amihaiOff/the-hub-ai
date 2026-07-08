import { renderToString } from 'react-dom/server';
import {
  getGroupIcon,
  getGroupIconColor,
  getGroupBarFillClass,
  getGroupChartColor,
  CategoryGroupIcon,
} from '../category-group-icons';

describe('getGroupIcon', () => {
  it('returns the wallet icon for income regardless of name', () => {
    const icon = getGroupIcon('anything', { type: 'income' });
    expect(icon).toBeTruthy();
  });

  it('returns the fallback Tag when name is missing/empty', () => {
    expect(getGroupIcon(null)).toBeTruthy();
    expect(getGroupIcon(undefined)).toBeTruthy();
    expect(getGroupIcon('   ')).toBeTruthy();
  });

  it('picks specific keywords via case-insensitive substring match', () => {
    const groceries = getGroupIcon('Groceries & pantry');
    const health = getGroupIcon('HEALTH insurance');
    const cars = getGroupIcon('  car rentals  ');
    expect(groceries).toBeTruthy();
    expect(health).toBeTruthy();
    expect(cars).toBeTruthy();
    // Different keywords produce different icon functions.
    expect(groceries).not.toBe(health);
    expect(groceries).not.toBe(cars);
  });

  it('respects the exact seed-name priority (essential over specific keywords)', () => {
    const essential = getGroupIcon('essential food expenses');
    const foodOnly = getGroupIcon('food');
    expect(essential).not.toBe(foodOnly);
  });

  it('falls back to Tag when no rule matches', () => {
    const custom = getGroupIcon('something completely custom');
    const empty = getGroupIcon('');
    expect(custom).toBe(empty);
  });
});

describe('getGroupIconColor', () => {
  it('returns green pill for income', () => {
    expect(getGroupIconColor('any', { type: 'income' })).toContain('green');
  });

  it('returns muted pill when name is missing', () => {
    expect(getGroupIconColor(null)).toContain('muted');
    expect(getGroupIconColor(undefined)).toContain('muted');
  });

  it('picks the right pill for known keywords', () => {
    expect(getGroupIconColor('Essential utilities')).toContain('blue');
    expect(getGroupIconColor('Lifestyle purchases')).toContain('pink');
    expect(getGroupIconColor('savings & investments')).toContain('emerald');
    expect(getGroupIconColor('Groceries')).toContain('amber');
    expect(getGroupIconColor('Health & medical')).toContain('red');
    expect(getGroupIconColor('Transport & car')).toContain('cyan');
    expect(getGroupIconColor('Entertainment')).toContain('purple');
    expect(getGroupIconColor('bills & utilit')).toContain('indigo');
  });

  it('falls back to muted for unknown keywords', () => {
    expect(getGroupIconColor('yolo bucket')).toContain('muted');
  });
});

describe('getGroupBarFillClass', () => {
  it('returns income bar fill for income opt', () => {
    expect(getGroupBarFillClass('anything', { type: 'income' })).toBe('bg-green-500/60');
  });
  it('returns default fill when name is missing', () => {
    expect(getGroupBarFillClass(null)).toBe('bg-foreground/40');
  });
  it('matches on keyword', () => {
    expect(getGroupBarFillClass('Coffee & snacks')).toBe('bg-amber-500/60');
    expect(getGroupBarFillClass('Health')).toBe('bg-red-500/60');
    expect(getGroupBarFillClass('Investments and savings')).toBe('bg-emerald-500/60');
  });
  it('falls back for unknown keyword', () => {
    expect(getGroupBarFillClass('mystery')).toBe('bg-foreground/40');
  });
});

describe('getGroupChartColor', () => {
  it('returns a fallback color when name is missing and cycles by index', () => {
    const a = getGroupChartColor(null, 0);
    const b = getGroupChartColor(null, 1);
    expect(a).toMatch(/^#[0-9a-f]{6}$/i);
    expect(a).not.toBe(b);
  });

  it('maps keywords to hex colors', () => {
    expect(getGroupChartColor('Essential expenses')).toBe('#3b82f6');
    expect(getGroupChartColor('Groceries')).toBe('#f59e0b');
    expect(getGroupChartColor('Health')).toBe('#ef4444');
  });

  it('falls back to the palette (wrapping around) for unknown names', () => {
    const color = getGroupChartColor('unknown group', 100);
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('CategoryGroupIcon component', () => {
  it('renders a real SVG element and forwards className', () => {
    const html = renderToString(<CategoryGroupIcon groupName="Groceries" className="my-class" />);
    expect(html).toContain('<svg');
    expect(html).toContain('my-class');
  });

  it('renders the wallet icon for income (delegating to getGroupIcon)', () => {
    const html = renderToString(<CategoryGroupIcon groupName={null} type="income" />);
    expect(html).toContain('<svg');
  });
});
