import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  aspectRatio,
  contentTransition,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
  progressViewStyle,
  resizable,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { UploadLiveActivityProps } from '../lib/uploadLiveActivityPresentation';

export type UploadStatusActivityProps = UploadLiveActivityProps;

const UploadStatusActivity = (
  props: UploadStatusActivityProps,
  _environment: LiveActivityEnvironment
) => {
  'widget';
  // Live Activity layouts are serialized and evaluated inside the widget
  // extension. Keep every value and view in this function — module-level
  // constants and helper components are not available in that runtime.
  const accent = '#0A84FF';
  const muted = '#A1A1AA';
  const error = '#FF453A';
  const success = '#30D158';
  const warning = '#FF9F0A';
  const progress = Math.max(0, Math.min(1, props.progress));
  const percent = `${Math.round(progress * 100)}%`;
  const isFailed = props.phase === 'failed';
  const isCompleted = props.phase === 'completed';
  const isOffline = props.phase === 'waiting_network';
  const isPaused = props.phase === 'paused';
  const isPreparing = props.phase === 'preparing';
  const statusColor = isFailed
    ? error
    : isCompleted
      ? success
      : isOffline
        ? warning
        : accent;
  const title = props.phase === 'completed'
    ? 'Wysłano'
    : props.phase === 'failed'
        ? 'Błąd wysyłania'
        : props.phase === 'waiting_network'
          ? 'Czeka na sieć'
          : props.phase === 'paused'
            ? 'Wysyłka wstrzymana'
          : props.phase === 'preparing'
            ? 'Przygotowywanie NiX'
          : props.phase === 'finalizing'
            ? 'Finalizowanie wysyłki'
            : 'Wysyłanie NiX';
  const subtitle = isFailed
    ? 'Stuknij, aby spróbować ponownie'
    : isCompleted
      ? 'NiX został wysłany'
      : isOffline
        ? 'Wznowimy po połączeniu z siecią'
        : isPaused
          ? 'Otwórz Skrzynkę, aby wznowić'
        : isPreparing
          ? 'Optymalizowanie pliku'
          : props.phase === 'finalizing'
            ? 'Jeszcze chwila'
            : props.remainingCount > 1
              ? `Pozostało: ${props.remainingCount}`
              : 'Wysyłanie bezpiecznie w tle';
  const icon = props.phase === 'completed'
    ? 'checkmark.circle.fill'
    : props.phase === 'failed'
        ? 'exclamationmark.triangle.fill'
        : props.phase === 'waiting_network'
          ? 'wifi.slash'
          : props.phase === 'paused'
            ? 'pause.circle.fill'
          : 'arrow.up.circle.fill';

  return {
    banner: (
      <HStack
        spacing={12}
        modifiers={[
          activityBackgroundTint('#0B0B0D'),
          widgetURL('nix://inbox'),
          padding({ all: 16 }),
          frame({ maxWidth: Infinity }),
        ]}>
        <Image
          assetName="NixWidgetLogo"
          modifiers={[
            resizable(),
            aspectRatio({ contentMode: 'fit' }),
            frame({ width: 34, height: 34 }),
          ]}
        />
        <VStack alignment="leading" spacing={3}>
          <Text
            modifiers={[
              font({ weight: 'semibold', size: 16 }),
              foregroundStyle('#FFFFFF'),
            ]}>
            {title}
          </Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>{subtitle}</Text>
        </VStack>
        <Spacer />
        {!isFailed && !isOffline && !isPaused ? (
          <Text
            modifiers={[
              font({ weight: 'semibold', design: 'rounded', size: 17 }),
              monospacedDigit(),
              contentTransition('numericText'),
              foregroundStyle(isCompleted ? success : '#FFFFFF'),
            ]}>
            {percent}
          </Text>
        ) : (
          <Image systemName="chevron.right" size={13} color={muted} />
        )}
      </HStack>
    ),
    compactLeading: isCompleted || isFailed || isOffline || isPaused ? (
      <Image
        systemName={icon}
        size={18}
        color={statusColor}
      />
    ) : (
      <ProgressView
        value={isPreparing ? null : progress}
        modifiers={[
          progressViewStyle('circular'),
          tint(statusColor),
          frame({ width: 22, height: 22 }),
        ]}
      />
    ),
    compactTrailing: isFailed ? (
      <Text modifiers={[font({ weight: 'semibold', design: 'rounded', size: 12 }), foregroundStyle(error)]}>
        Błąd
      </Text>
    ) : isOffline ? (
      <Text modifiers={[font({ weight: 'semibold', design: 'rounded', size: 12 }), foregroundStyle(warning)]}>
        Sieć
      </Text>
    ) : isPaused ? (
      <Text modifiers={[font({ weight: 'semibold', design: 'rounded', size: 12 }), foregroundStyle(muted)]}>
        Pauza
      </Text>
    ) : (
      <Text
        modifiers={[
          font({ weight: 'semibold', design: 'rounded', size: 13 }),
          monospacedDigit(),
          contentTransition('numericText'),
          foregroundStyle(isCompleted ? success : '#FFFFFF'),
        ]}>
        {percent}
      </Text>
    ),
    minimal: isCompleted || isFailed || isOffline || isPaused ? (
      <Image
        systemName={icon}
        size={18}
        color={statusColor}
      />
    ) : (
      <ProgressView
        value={isPreparing ? null : progress}
        modifiers={[
          progressViewStyle('circular'),
          tint(statusColor),
          frame({ width: 22, height: 22 }),
        ]}
      />
    ),
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 6 })]}>
        <Image
          assetName="NixWidgetLogo"
          modifiers={[
            resizable(),
            aspectRatio({ contentMode: 'fit' }),
            frame({ width: 19, height: 19 }),
          ]}
        />
        <Text modifiers={[font({ weight: 'semibold', size: 14 }), foregroundStyle('#FFFFFF')]}>
          NiX
        </Text>
      </HStack>
    ),
    expandedTrailing: isFailed ? (
      <Text
        modifiers={[
          padding({ trailing: 6 }),
          font({ weight: 'semibold', design: 'rounded', size: 13 }),
          foregroundStyle(error),
        ]}>
        Błąd
      </Text>
    ) : isOffline ? (
      <Text
        modifiers={[
          padding({ trailing: 6 }),
          font({ weight: 'semibold', design: 'rounded', size: 13 }),
          foregroundStyle(warning),
        ]}>
        Brak sieci
      </Text>
    ) : isPaused ? (
      <Text
        modifiers={[
          padding({ trailing: 6 }),
          font({ weight: 'semibold', design: 'rounded', size: 13 }),
          foregroundStyle(muted),
        ]}>
        Pauza
      </Text>
    ) : (
      <Text
        modifiers={[
          padding({ trailing: 6 }),
          font({ weight: 'semibold', design: 'rounded', size: 14 }),
          monospacedDigit(),
          contentTransition('numericText'),
          foregroundStyle(isCompleted ? success : '#FFFFFF'),
        ]}>
        {percent}
      </Text>
    ),
    expandedBottom: (
      <VStack
        alignment="leading"
        spacing={7}
        modifiers={[padding({ horizontal: 6, bottom: 5 })]}>
        <Text
          modifiers={[
            font({ weight: 'semibold', size: 15 }),
            foregroundStyle('#FFFFFF'),
          ]}>
          {title}
        </Text>
        {!isFailed && !isCompleted && !isPaused ? (
          <ProgressView
            value={isPreparing ? null : progress}
            modifiers={[
              progressViewStyle('linear'),
              tint(statusColor),
              frame({ maxWidth: Infinity }),
            ]}
          />
        ) : null}
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>{subtitle}</Text>
      </VStack>
    ),
  };
};

export default createLiveActivity<UploadStatusActivityProps>(
  'UploadStatusActivity',
  UploadStatusActivity
);
