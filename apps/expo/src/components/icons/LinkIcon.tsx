/**
 * LinkIcon — a link's tile: the platform's brand mark in a rounded square,
 * exactly what the published Page (app preview and creds.id alike) draws.
 *
 * It is the ONE link tile in the app. A signed link carries only a label and
 * a URL, so a fetched profile picture or favicon is never what visitors see;
 * showing one in an editor row and the brand mark in the preview read as two
 * different choices. Fetched pictures are only ever offered as the Page photo
 * (`useAvatarEditor` / the link sheet's "use as photo" row), never as a tile.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { BrandIcon } from '@/components/icons/BrandIcon';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { linkDisplay } from '@/profile/linkPresentation';

export function LinkIcon({
  label,
  url,
  size,
  glyph,
  surface,
  color = Colors.primaryBlue,
}: {
  readonly label: string;
  readonly url: string;
  /** Tile edge. */
  readonly size: number;
  /** Brand glyph size inside the tile. */
  readonly glyph: number;
  readonly surface: string;
  /** Glyph ink; the Page preview passes its template's accent. */
  readonly color?: string;
  /** Kept for callers written when tiles could also show a fetched picture;
   *  every tile is the brand tile now. */
  readonly brandOnly?: boolean;
}): ReactNode {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Radius.field,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: surface,
      }}>
      <BrandIcon name={linkDisplay(label, url).brand} size={glyph} color={color} />
    </View>
  );
}
