/**
 * BrandBadge — a platform's mark on its own colour in a circle, the round
 * icons of Linktree's "Suggested" list. Colours come from `BrandColors`
 * (Colors.ts); Instagram's mark sits on its gradient. A black badge gets a
 * hairline edge in dark mode so it does not dissolve into the sheet.
 *
 * `maps` and `form` are not brands with a sprite glyph; they draw an SF
 * Symbol on their colour instead.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { BrandColors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { useThemeColors } from '@/constants/useThemeColors';

import { BrandIcon } from './BrandIcon';
import type { BrandIconName } from './brandGlyphs';
import { SfIcon } from './SfIcon';

export type BrandBadgeName = BrandIconName | 'maps' | 'form';

type BrandColorKey = Exclude<keyof typeof BrandColors, 'edgeOnDark'>;

function colorsFor(name: BrandBadgeName): (typeof BrandColors)[BrandColorKey] {
  if (name === 'globe' || name === 'link') return BrandColors.web;
  return BrandColors[name];
}

export function BrandBadge({ name, size = 44 }: { readonly name: BrandBadgeName; readonly size?: number }): ReactNode {
  const c = useThemeColors();
  const colors = colorsFor(name);
  const glyph = Math.round(size * 0.48);
  const edge = c.scheme === 'dark' && colors.bg === BrandColors.x.bg;
  const mark = name === 'maps' || name === 'form'
    ? <SfIcon name={name === 'maps' ? 'mappin.and.ellipse' : 'list.bullet.clipboard'} size={glyph} color={colors.fg} weight="medium" />
    : <BrandIcon name={name} size={glyph} color={colors.fg} />;
  const shape = {
    width: size,
    height: size,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: edge ? 1 : 0,
    borderColor: BrandColors.edgeOnDark,
  } as const;
  if ('stops' in colors) {
    return (
      <LinearGradient colors={colors.stops} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={shape}>
        {mark}
      </LinearGradient>
    );
  }
  return <View style={[shape, { backgroundColor: colors.bg }]}>{mark}</View>;
}
