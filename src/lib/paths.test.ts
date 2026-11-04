import { describe, expect, it } from 'vitest';
import { parentPath } from './paths';

describe('parentPath', () => {
  it('handles Windows drive paths', () => {
    expect(parentPath('C:\\')).toBe('C:\\');
    expect(parentPath('C:')).toBe('C:\\');
    expect(parentPath('C:\\Users')).toBe('C:\\');
    expect(parentPath('C:\\Users\\me\\')).toBe('C:\\Users');
    expect(parentPath('D:/Games/Steam')).toBe('D:/Games');
  });

  it('handles UNC paths', () => {
    expect(parentPath('\\\\nas\\share')).toBe('\\\\nas\\share\\');
    expect(parentPath('\\\\nas\\share\\photos\\2024')).toBe('\\\\nas\\share\\photos');
  });

  it('handles Unix paths', () => {
    expect(parentPath('/')).toBe('/');
    expect(parentPath('/home')).toBe('/');
    expect(parentPath('/home/me/')).toBe('/home');
    expect(parentPath('/mnt/data/media')).toBe('/mnt/data');
  });
});
