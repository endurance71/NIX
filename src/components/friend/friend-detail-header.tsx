import { View } from 'react-native';
import { RNHostView, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityElement,
  font,
  foregroundStyle,
  frame,
  listRowBackground,
  listRowInsets,
  multilineTextAlignment,
  textSelection,
} from '@expo/ui/swift-ui/modifiers';
import type { FriendProfile } from '../../services/friendService';
import { AvatarCircle } from '../ui/avatar-circle';
import type { FriendshipBadge } from '../../lib/friendStreaks';
import { FriendshipBadgeLabel } from './FriendshipBadgeLabel';

const AVATAR_SIZE = 96;

/** Contact-card header: avatar, display name, @username and the bio the friend chose to show. */
export function FriendDetailHeader({
  friend,
  avatarUrl,
  friendshipBadge = null,
}: {
  friend: FriendProfile;
  avatarUrl: string | null;
  /** Streak / best-friend glyphs under the name (read as part of the combined header label). */
  friendshipBadge?: FriendshipBadge | null;
}) {
  const displayName = friend.display_name?.trim();
  const bio = friend.bio?.trim();
  return (
    <VStack
      alignment="center"
      spacing={6}
      modifiers={[
        frame({ maxWidth: Infinity, alignment: 'center' }),
        listRowBackground('transparent'),
        listRowInsets({ top: 8, leading: 16, bottom: 8, trailing: 16 }),
      ]}>
      <RNHostView matchContents>
        <View
          collapsable={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
          <AvatarCircle
            size={AVATAR_SIZE}
            url={avatarUrl}
            storagePath={friend.avatar_storage_path ?? null}
            emoji={friend.avatar_emoji ?? null}
            fallbackInitial={displayName || friend.username}
          />
        </View>
      </RNHostView>
      <VStack
        alignment="center"
        spacing={2}
        modifiers={[accessibilityElement('combine'), accessibilityAddTraits(['isHeader'])]}>
        <Text
          modifiers={[
            font({ design: 'rounded', textStyle: 'title2', weight: 'bold' }),
            foregroundStyle({ type: 'hierarchical', style: 'primary' }),
            multilineTextAlignment('center'),
          ]}>
          {displayName || `@${friend.username}`}
        </Text>
        {displayName ? (
          <Text
            modifiers={[
              font({ design: 'rounded', textStyle: 'subheadline' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
              textSelection(true),
            ]}>
            {`@${friend.username}`}
          </Text>
        ) : null}
        <FriendshipBadgeLabel badge={friendshipBadge} />
      </VStack>
      {bio ? (
        <Text
          modifiers={[
            font({ design: 'rounded', textStyle: 'body' }),
            foregroundStyle({ type: 'hierarchical', style: 'primary' }),
            multilineTextAlignment('center'),
            textSelection(true),
          ]}>
          {bio}
        </Text>
      ) : null}
    </VStack>
  );
}
