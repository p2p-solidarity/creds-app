/**
 * LinkIcon — a link row's round tile: the profile picture for a social
 * profile, the site's own icon for a website, and the brand glyph until one
 * of those has actually loaded (or when the page offers none / fails).
 *
 * The picture fades in over the glyph instead of replacing it, so a slow
 * image never blanks the tile; a failed image load falls back to the glyph.
 */
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { BrandIcon } from '@/components/icons/BrandIcon';
import { Colors } from '@/constants/Colors';
import { Radius } from '@/constants/radius';
import { DURATION } from '@/feedback/motion';
import { linkDisplay } from '@/profile/linkPresentation';
import { useLinkPreview } from '@/profile/linkPreviewStore';

export function LinkIcon({
  label,
  url,
  size,
  glyph,
  surface,
}: {
  readonly label: string;
  readonly url: string;
  /** Tile edge. */
  readonly size: number;
  /** Brand glyph size inside the tile. */
  readonly glyph: number;
  readonly surface: string;
}): ReactNode {
  const preview = useLinkPreview(url);
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const picture =
    preview?.status === 'ready' ? (preview.preview.avatar ?? preview.preview.icon) : null;
  const showPicture = picture !== null && failed !== picture;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Radius.pill,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: surface,
      }}>
      <BrandIcon name={linkDisplay(label, url).brand} size={glyph} color={Colors.primaryBlue} />
      {showPicture ? (
        <Image
          source={{ uri: picture }}
          contentFit="cover"
          transition={DURATION.enter}
          accessibilityIgnoresInvertColors
          onLoad={() => {
            setLoaded(picture);
          }}
          onError={() => {
            setFailed(picture);
          }}
          // The tile's ground only goes behind the picture once it has drawn;
          // until then the glyph underneath stays visible.
          style={{
            position: 'absolute',
            width: size,
            height: size,
            backgroundColor: loaded === picture ? surface : 'transparent',
          }}
        />
      ) : null}
    </View>
  );
}
