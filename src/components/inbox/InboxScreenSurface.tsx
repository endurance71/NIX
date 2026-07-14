import { Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Button,
  Circle,
  ContentUnavailableView,
  HStack,
  Image,
  List,
  ProgressView,
  RNHostView,
  Section,
  SwipeActions,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityHint,
  accessibilityLabel,
  buttonStyle,
  containerRelativeFrame,
  contentShape,
  controlSize,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineLimit,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  listStyle,
  multilineTextAlignment,
  onTapGesture,
  padding,
  refreshable,
  scrollContentBackground,
  shapes,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { IncomingFriendRequest } from '../../services/friendService';
import type { InboxRowModel, InboxRowStatus } from '../../lib/inboxPresentation';
import type { InboxScreenViewModel } from '../../hooks/useInboxScreen';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppHost } from '../ui/app-host';
import { AvatarCircle } from '../ui/avatar-circle';

const MESSAGE_AVATAR_SIZE = 52;
const INVITE_AVATAR_SIZE = 44;
const supportsContentUnavailableView =
  Platform.OS === 'ios' && Number.parseFloat(String(Platform.Version)) >= 17;

type InboxScreenSurfaceProps = {
  vm: InboxScreenViewModel;
  onRequestDelete: (row: InboxRowModel) => void;
};

type Translate = InboxScreenViewModel['t'];

function avatarView({
  size,
  url,
  storagePath,
  emoji,
  fallbackInitial,
}: {
  size: number;
  url: string | null;
  storagePath: string | null;
  emoji: string | null;
  fallbackInitial: string;
}) {
  return (
    <RNHostView matchContents>
      <View collapsable={false} style={{ width: size, height: size }}>
        <AvatarCircle
          size={size}
          url={url}
          storagePath={storagePath}
          emoji={emoji}
          fallbackInitial={fallbackInitial}
        />
      </View>
    </RNHostView>
  );
}

function statusLabel(status: InboxRowStatus, t: Translate) {
  switch (status) {
    case 'new':
      return t('inbox.newNix');
    case 'opened':
      return t('inbox.opened');
    case 'cleaned':
      return t('inbox.cleaned');
    case 'cleanupFailed':
      return t('inbox.cleanupFailed');
    case 'sent':
      return t('inbox.sent');
  }
}

function MessageRowContent({
  row,
  avatarUrl,
  busy,
  onOpen,
  t,
}: {
  row: InboxRowModel;
  avatarUrl: string | null;
  busy: boolean;
  onOpen: () => void;
  t: Translate;
}) {
  const { colors } = useAppTheme();
  const label = statusLabel(row.status, t);
  const canOpen = Boolean(row.openParams) && !busy;

  return (
    <HStack
      alignment="top"
      spacing={12}
      modifiers={[
        frame({ maxWidth: Infinity, minHeight: 52, alignment: 'leading' }),
        listRowInsets({ top: 12, leading: 8, bottom: 12, trailing: 16 }),
        listRowSeparator('hidden', 'top'),
        listRowBackground(colors.systemBackground),
        contentShape(shapes.rectangle()),
        accessibilityLabel(`@${row.username}, ${label}, ${row.timestampLabel}`),
        ...(canOpen ? [accessibilityHint(t('inbox.openHint')), onTapGesture(onOpen)] : []),
      ]}>
      <HStack alignment="center" spacing={8}>
        <Circle
          modifiers={[
            frame({ width: 8, height: 8 }),
            foregroundStyle(row.unread ? colors.systemBlue : '#00000000'),
            accessibilityHidden(),
          ]}
        />
        {avatarView({
          size: MESSAGE_AVATAR_SIZE,
          url: avatarUrl,
          storagePath: row.avatarStoragePath,
          emoji: row.avatarEmoji,
          fallbackInitial: row.username,
        })}
      </HStack>

      <VStack
        alignment="leading"
        spacing={3}
        modifiers={[
          frame({ maxWidth: Infinity, alignment: 'leading' }),
          padding({ top: 2 }),
          layoutPriority(1),
        ]}>
        <Text
          modifiers={[
            font({ textStyle: 'body', weight: row.unread ? 'semibold' : 'regular' }),
            foregroundStyle({ type: 'hierarchical', style: 'primary' }),
            lineLimit(1),
          ]}>
          @{row.username}
        </Text>
        <Text
          modifiers={[
            font({ textStyle: 'subheadline' }),
            foregroundStyle(
              row.status === 'cleanupFailed'
                ? colors.destructive
                : { type: 'hierarchical', style: 'secondary' }
            ),
            lineLimit(1),
          ]}>
          {label}
        </Text>
      </VStack>

      {busy ? (
        <ProgressView modifiers={[accessibilityLabel(t('common.loading'))]} />
      ) : (
        <Text
          modifiers={[
            font({ textStyle: 'subheadline' }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            lineLimit(1),
            padding({ top: 2 }),
            layoutPriority(2),
          ]}>
          {row.timestampLabel}
        </Text>
      )}
    </HStack>
  );
}

function MessageRow({
  row,
  avatarUrl,
  busy,
  onOpen,
  onDelete,
  t,
}: {
  row: InboxRowModel;
  avatarUrl: string | null;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
  t: Translate;
}) {
  const content = (
    <MessageRowContent row={row} avatarUrl={avatarUrl} busy={busy} onOpen={onOpen} t={t} />
  );

  if (busy) return content;

  return (
    <SwipeActions>
      {content}
      <SwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
        <Button label={t('inbox.delete')} role="destructive" onPress={onDelete} />
      </SwipeActions.Actions>
    </SwipeActions>
  );
}

function InviteRow({
  request,
  avatarUrl,
  busy,
  onAccept,
  onReject,
  t,
}: {
  request: IncomingFriendRequest;
  avatarUrl: string | null;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  t: Translate;
}) {
  const { colors } = useAppTheme();
  const avatarPath = request.requester.avatar_storage_path ?? null;
  const content = (
    <HStack
      alignment="center"
      spacing={12}
      modifiers={[
        frame({ maxWidth: Infinity, minHeight: 44, alignment: 'leading' }),
        listRowInsets({ top: 10, leading: 16, bottom: 10, trailing: 16 }),
        listRowSeparator('hidden', 'top'),
        listRowBackground(colors.systemBackground),
        accessibilityLabel(
          `@${request.requester.username}, ${t('inbox.inviteDescription')}`
        ),
      ]}>
      {avatarView({
        size: INVITE_AVATAR_SIZE,
        url: avatarUrl,
        storagePath: avatarPath,
        emoji: request.requester.avatar_emoji ?? null,
        fallbackInitial: request.requester.username,
      })}
      <VStack
        alignment="leading"
        spacing={2}
        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' }), layoutPriority(1)]}>
        <Text
          modifiers={[
            font({ textStyle: 'body', weight: 'semibold' }),
            foregroundStyle({ type: 'hierarchical', style: 'primary' }),
            lineLimit(1),
          ]}>
          @{request.requester.username}
        </Text>
        <Text
          modifiers={[
            font({ textStyle: 'subheadline' }),
            foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            lineLimit(2),
          ]}>
          {t('inbox.inviteDescription')}
        </Text>
      </VStack>
      {busy ? (
        <ProgressView modifiers={[accessibilityLabel(t('common.loading'))]} />
      ) : (
        <Button
          label={t('inbox.accept')}
          onPress={onAccept}
          modifiers={[
            buttonStyle('borderedProminent'),
            controlSize('small'),
            tint(colors.systemBlue),
          ]}
        />
      )}
    </HStack>
  );

  if (busy) return content;

  return (
    <SwipeActions>
      {content}
      <SwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
        <Button label={t('inbox.reject')} role="destructive" onPress={onReject} />
      </SwipeActions.Actions>
    </SwipeActions>
  );
}

function LegacyUnavailableState({
  title,
  description,
  systemImage,
}: {
  title: string;
  description: string;
  systemImage: 'tray' | 'exclamationmark.triangle';
}) {
  return (
    <VStack alignment="center" spacing={8} modifiers={[padding({ horizontal: 32 })]}>
      <Image
        systemName={systemImage}
        modifiers={[
          font({ textStyle: 'largeTitle' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          accessibilityHidden(),
        ]}
      />
      <Text
        modifiers={[
          font({ textStyle: 'title3', weight: 'semibold' }),
          foregroundStyle({ type: 'hierarchical', style: 'primary' }),
          multilineTextAlignment('center'),
        ]}>
        {title}
      </Text>
      <Text
        modifiers={[
          font({ textStyle: 'subheadline' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
          multilineTextAlignment('center'),
        ]}>
        {description}
      </Text>
    </VStack>
  );
}

function UnavailableRow({
  kind,
  title,
  description,
  retryLabel,
  onRetry,
}: {
  kind: 'empty' | 'error';
  title: string;
  description: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  const { colors } = useAppTheme();
  const systemImage = kind === 'empty' ? 'tray' : 'exclamationmark.triangle';
  const state =
    kind === 'empty' && supportsContentUnavailableView ? (
      <ContentUnavailableView title={title} description={description} systemImage={systemImage} />
    ) : (
      <LegacyUnavailableState title={title} description={description} systemImage={systemImage} />
    );

  return (
    <VStack
      alignment="center"
      spacing={16}
      modifiers={[
        frame({ maxWidth: Infinity, minHeight: 360, alignment: 'center' }),
        ...(supportsContentUnavailableView
          ? [containerRelativeFrame({ axes: 'vertical', alignment: 'center' })]
          : []),
        listRowInsets({ top: 0, leading: 0, bottom: 0, trailing: 0 }),
        listRowSeparator('hidden'),
        listRowBackground(colors.systemBackground),
      ]}>
      {state}
      {retryLabel && onRetry ? (
        <Button
          label={retryLabel}
          onPress={onRetry}
          modifiers={[
            buttonStyle('borderedProminent'),
            controlSize('regular'),
            tint(colors.systemBlue),
          ]}
        />
      ) : null}
    </VStack>
  );
}

function InboxList({ vm, onRequestDelete }: InboxScreenSurfaceProps) {
  const { colors, statusBarStyle } = useAppTheme();
  const listModifiers = [
    frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
    listStyle('plain'),
    scrollContentBackground('hidden'),
    refreshable(vm.handleRefresh),
  ];

  const renderMessageRow = (row: InboxRowModel) => {
    const avatarUrl = row.avatarStoragePath
      ? vm.avatarUrls[row.avatarStoragePath] ?? null
      : null;
    return (
      <MessageRow
        key={row.id}
        row={row}
        avatarUrl={avatarUrl}
        busy={vm.deletingPeerIds.has(row.peerId)}
        onOpen={() => vm.handleOpen(row)}
        onDelete={() => onRequestDelete(row)}
        t={vm.t}
      />
    );
  };

  const messageRows = vm.rows.map(renderMessageRow);

  return (
    <AppHost
      style={[styles.container, { backgroundColor: colors.systemBackground }]}
      useViewportSizeMeasurement>
      <StatusBar style={statusBarStyle} />
      <List modifiers={listModifiers}>
        {vm.initialError ? (
          <UnavailableRow
            kind="error"
            title={vm.t('inbox.loadErrorTitle')}
            description={vm.t('inbox.loadErrorDescription')}
            retryLabel={vm.t('inbox.retry')}
            onRetry={() => void vm.handleRetry()}
          />
        ) : vm.requests.length === 0 && vm.rows.length === 0 ? (
          <UnavailableRow
            kind="empty"
            title={vm.t('inbox.emptyTitle')}
            description={vm.t('inbox.emptyDescription')}
          />
        ) : (
          <>
            {vm.requests.length > 0 ? (
              <Section title={vm.t('inbox.invites')}>
                {vm.requests.map((request) => {
                  const avatarPath = request.requester.avatar_storage_path ?? null;
                  return (
                    <InviteRow
                      key={request.id}
                      request={request}
                      avatarUrl={avatarPath ? vm.avatarUrls[avatarPath] ?? null : null}
                      busy={vm.inviteActionIds.has(request.id)}
                      onAccept={() => void vm.handleAccept(request.id)}
                      onReject={() => void vm.handleReject(request.id)}
                      t={vm.t}
                    />
                  );
                })}
              </Section>
            ) : null}
            {messageRows.length > 0 && vm.requests.length > 0 ? (
              <Section title={vm.t('inbox.messages')}>{messageRows}</Section>
            ) : (
              messageRows
            )}
          </>
        )}
      </List>
    </AppHost>
  );
}

export function InboxScreenSurface(props: InboxScreenSurfaceProps) {
  const { colors, statusBarStyle } = useAppTheme();

  if (props.vm.loading) {
    return (
      <AppHost style={[styles.container, { backgroundColor: colors.systemBackground }]}>
        <StatusBar style={statusBarStyle} />
        <VStack
          alignment="center"
          modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'center' })]}>
          <ProgressView modifiers={[accessibilityLabel(props.vm.t('common.loading'))]} />
        </VStack>
      </AppHost>
    );
  }

  return <InboxList {...props} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
