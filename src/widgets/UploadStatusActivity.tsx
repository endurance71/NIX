import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
  progressViewStyle,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { UploadLiveActivityProps } from '../lib/uploadLiveActivityPresentation';

export type UploadStatusActivityProps = UploadLiveActivityProps;

const ACCENT = '#0A84FF';
const MUTED = '#A1A1AA';
const ERROR = '#FF453A';
const SUCCESS = '#30D158';

function UploadProgress({ progress, compact = false }: { progress: number; compact?: boolean }) {
  'widget';
  return (
    <ProgressView
      value={progress}
      modifiers={[
        progressViewStyle(compact ? 'circular' : 'linear'),
        tint(ACCENT),
        ...(compact ? [frame({ width: 24, height: 24 })] : [frame({ maxWidth: Infinity })]),
      ]}
    />
  );
}

const UploadStatusActivity = (
  props: UploadStatusActivityProps,
  _environment: LiveActivityEnvironment
) => {
  'widget';
  const progress = Math.max(0, Math.min(1, props.progress));
  const percent = `${Math.round(progress * 100)}%`;
  const title = props.phase === 'completed'
    ? 'Wysłano'
    : props.phase === 'failed'
      ? 'Błąd wysyłania'
      : props.phase === 'waiting_network'
        ? 'Czeka na sieć'
        : props.phase === 'preparing'
          ? 'Przygotowywanie NiX'
          : props.phase === 'finalizing'
            ? 'Finalizowanie wysyłki'
            : 'Wysyłanie NiX';
  const icon = props.phase === 'completed'
    ? 'checkmark.circle.fill'
    : props.phase === 'failed'
      ? 'exclamationmark.triangle.fill'
      : props.phase === 'waiting_network'
        ? 'wifi.slash'
        : 'arrow.up.circle.fill';

  return {
    banner: (
      <VStack
        alignment="leading"
        spacing={10}
        modifiers={[
          activityBackgroundTint('#101012'),
          widgetURL('nix://inbox'),
          padding({ all: 16 }),
          frame({ maxWidth: Infinity, alignment: 'leading' }),
        ]}>
        <HStack spacing={8}>
          <Image
            systemName={icon}
            size={18}
            color={props.phase === 'failed' ? ERROR : props.phase === 'completed' ? SUCCESS : ACCENT}
          />
          <Text modifiers={[font({ weight: 'semibold', size: 16 }), foregroundStyle('#FFFFFF')]}>
            {title}
          </Text>
          <Spacer />
          {props.phase !== 'failed' ? (
            <Text modifiers={[font({ weight: 'semibold', size: 14 }), monospacedDigit(), foregroundStyle('#FFFFFF')]}>
              {percent}
            </Text>
          ) : null}
        </HStack>
        {props.phase !== 'failed' ? <UploadProgress progress={progress} /> : null}
        <Text modifiers={[font({ size: 12 }), foregroundStyle(MUTED)]}>
          {props.phase === 'failed'
            ? 'Spróbuj ponownie w Skrzynce'
            : props.remainingCount > 1
              ? `Pozostało: ${props.remainingCount}`
              : 'Bezpieczna wysyłka w tle'}
        </Text>
      </VStack>
    ),
    compactLeading: props.phase === 'completed' || props.phase === 'failed' ? (
      <Image
        systemName={icon}
        size={18}
        color={props.phase === 'failed' ? ERROR : SUCCESS}
      />
    ) : (
      <UploadProgress progress={progress} compact />
    ),
    compactTrailing: props.phase === 'failed' ? (
      <Text modifiers={[font({ weight: 'semibold', size: 12 }), foregroundStyle(ERROR)]}>
        Błąd
      </Text>
    ) : (
      <Text modifiers={[font({ weight: 'semibold', size: 13 }), monospacedDigit(), foregroundStyle('#FFFFFF')]}>
        {percent}
      </Text>
    ),
    minimal: props.phase === 'completed' || props.phase === 'failed' ? (
      <Image
        systemName={icon}
        size={18}
        color={props.phase === 'failed' ? ERROR : SUCCESS}
      />
    ) : (
      <UploadProgress progress={progress} compact />
    ),
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 6 })]}>
        <Image
          systemName={icon}
          size={17}
          color={props.phase === 'failed' ? ERROR : props.phase === 'completed' ? SUCCESS : ACCENT}
        />
        <Text modifiers={[font({ weight: 'semibold', size: 14 }), foregroundStyle('#FFFFFF')]}>NiX</Text>
      </HStack>
    ),
    expandedTrailing: props.phase === 'failed' ? (
      <Text
        modifiers={[
          padding({ trailing: 6 }),
          font({ weight: 'semibold', size: 13 }),
          foregroundStyle(ERROR),
        ]}>
        Błąd
      </Text>
    ) : (
      <Text
        modifiers={[
          padding({ trailing: 6 }),
          font({ weight: 'semibold', size: 14 }),
          monospacedDigit(),
          foregroundStyle('#FFFFFF'),
        ]}>
        {percent}
      </Text>
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ horizontal: 6, bottom: 4 })]}>
        <Text modifiers={[font({ size: 13 }), foregroundStyle('#FFFFFFCC')]}>{title}</Text>
        {props.phase === 'failed' ? (
          <Text modifiers={[font({ size: 12 }), foregroundStyle(MUTED)]}>
            Spróbuj ponownie w Skrzynce
          </Text>
        ) : (
          <UploadProgress progress={progress} />
        )}
      </VStack>
    ),
  };
};

export default createLiveActivity<UploadStatusActivityProps>(
  'UploadStatusActivity',
  UploadStatusActivity
);
