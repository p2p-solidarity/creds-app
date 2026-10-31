/**
 * The picture a signed Page carries (`record.avatar`), or its initial.
 *
 * The URL comes from someone else's Page and this phone fetches it, so it goes
 * through the same https-only / no-private-IP guard as link checks
 * (`publicHttpsUrl`); anything else — a blob hash, http, a LAN address — and a
 * load failure all fall back to the initial.
 */
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed';
import { publicHttpsUrl } from '@/profile/httpsOwnership';

export function PageAvatar({
  avatar,
  displayName,
  size,
}: {
  readonly avatar: string | null;
  readonly displayName: string;
  readonly size: number;
}): ReactNode {
  const [failed, setFailed] = useState(false);
  const url = avatar === null || failed ? null : publicHttpsUrl(avatar);

  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full bg-searchBg"
      style={{ width: size, height: size }}>
      {url !== null ? (
        <Image
          source={{ uri: url.toString() }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={120}
          accessibilityIgnoresInvertColors
          onError={() => {
            setFailed(true);
          }}
        />
      ) : (
        <ThemedText variant={size >= 56 ? 'titleLarge' : 'bodyMedium'} tone="secondary">
          {initial(displayName)}
        </ThemedText>
      )}
    </View>
  );
}

function initial(displayName: string): string {
  const first = Array.from(displayName.trim())[0];
  return first === undefined ? '?' : first.toUpperCase();
}
