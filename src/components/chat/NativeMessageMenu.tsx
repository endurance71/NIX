import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Host } from '@expo/ui';
import { Button, ContextMenu, Divider, Picker, RNHostView, Section, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, font, menuOrder, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useTranslation } from 'react-i18next';
import { MESSAGE_REACTION_EMOJIS, MESSAGE_REACTION_GLYPHS } from '../../services/messageReactionService';
import { resolveAppIconName, type AppIconName } from '../../theme/app-icons';
import type { MessageReactionEmoji } from '../../types/database.types';

export type NativeMessageMenuAction = {
  key: string;
  label: string;
  icon: AppIconName;
  destructive: boolean;
  /** Actions with the same section are grouped; sections are separated like in Messages. */
  section: number;
  onPress: () => void;
};

function groupBySection(actions: readonly NativeMessageMenuAction[]): NativeMessageMenuAction[][] {
  const groups: NativeMessageMenuAction[][] = [];
  for (const action of actions) {
    const last = groups.at(-1);
    if (last && last[0].section === action.section) last.push(action);
    else groups.push([action]);
  }
  return groups;
}

/**
 * The system context menu on a chat bubble (UIContextMenuInteraction through SwiftUI): the
 * bubble lifts, the chat blurs, the Tapback emoji sit in a native palette row on top and the
 * actions follow in sections. Everything is UIKit — haptics, VoiceOver, Reduce Motion, menu
 * placement near the screen edges.
 *
 * The bubble stays a React Native view, hosted as the menu's trigger.
 */
export function NativeMessageMenu({
  children,
  canReact,
  selectedEmoji,
  onReact,
  onRemoveReaction,
  actions,
  bleed = 0,
  preview,
}: {
  children: ReactElement;
  /**
   * What lifts while the menu is open. Without it the system lifts the hosted trigger, bleed
   * included, on a light platter that framed the bubble.
   */
  preview?: ReactElement;
  /**
   * Room around the bubble for what draws outside it (the tail, Tapback badges): the hosted view
   * clips to its bounds, so it grows by `bleed` on each side and a negative margin keeps the layout.
   */
  bleed?: number;
  canReact: boolean;
  selectedEmoji: MessageReactionEmoji | null;
  onReact: (emoji: MessageReactionEmoji) => void;
  onRemoveReaction: () => void;
  actions: readonly NativeMessageMenuAction[];
}) {
  const { t } = useTranslation();
  if (!canReact && actions.length === 0) return children;
  return (
    <Host matchContents style={{ marginHorizontal: -bleed }}>
      <ContextMenu modifiers={[menuOrder('fixed')]}>
        <ContextMenu.Trigger>
          <RNHostView matchContents>
            <View collapsable={false} style={{ paddingHorizontal: bleed }}>
              {children}
            </View>
          </RNHostView>
        </ContextMenu.Trigger>
        {preview ? (
          <ContextMenu.Preview>
            <RNHostView matchContents>{preview}</RNHostView>
          </ContextMenu.Preview>
        ) : null}
        <ContextMenu.Items>
          {canReact ? (
            <Section>
              <Picker<string>
                selection={selectedEmoji ?? ''}
                onSelectionChange={(value) => {
                  if (value) onReact(value as MessageReactionEmoji);
                }}
                // No visible label: in a menu it becomes a section title, and Messages shows the
                // palette without one. VoiceOver still gets the name.
                modifiers={[pickerStyle('palette'), accessibilityLabel(t('chat.reactionPalette'))]}>
                {MESSAGE_REACTION_EMOJIS.map((emoji) => (
                  <Text key={emoji} modifiers={[tag(emoji), font({ size: 28 })]}>
                    {MESSAGE_REACTION_GLYPHS[emoji]}
                  </Text>
                ))}
              </Picker>
              {selectedEmoji ? (
                <Button
                  label={t('chat.removeReaction')}
                  systemImage={resolveAppIconName('clearText')}
                  onPress={onRemoveReaction}
                />
              ) : null}
            </Section>
          ) : null}
          {groupBySection(actions).map((group, index) => (
            <Section key={group[0].key}>
              {index > 0 && !canReact ? <Divider /> : null}
              {group.map((action) => (
                <Button
                  key={action.key}
                  label={action.label}
                  systemImage={resolveAppIconName(action.icon)}
                  role={action.destructive ? 'destructive' : undefined}
                  onPress={action.onPress}
                />
              ))}
            </Section>
          ))}
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}
