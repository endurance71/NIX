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
  _environment: LiveActivityEnvironment,
) => {
  'widget';
  // Live Activity layouts are serialized and evaluated inside the widget
  // extension. Keep every value and view in this function — module-level
  // constants and helper components are not available in that runtime.
  const pl = props.locale === 'pl';
  const accent = '#0A84FF';
  const muted = '#A1A1AA';
  const error = '#FF453A';
  const success = '#30D158';
  const warning = '#FF9F0A';
  const progress = Math.max(0, Math.min(1, props.progress));
  const percent = `${Math.round(progress * 100)}%`;
  const copy = pl
    ? {
        completed: ['Wysłano', 'NiX został wysłany', '', ''],
        failed: ['Błąd wysyłania', 'Stuknij, aby spróbować ponownie', 'Błąd', 'Błąd'],
        waiting_network: ['Czeka na sieć', 'Wznowimy po połączeniu z siecią', 'Sieć', 'Brak sieci'],
        paused: ['Wysyłka wstrzymana', 'Otwórz Skrzynkę, aby wznowić', 'Pauza', 'Pauza'],
        preparing: ['Przygotowywanie NiX', 'Optymalizowanie pliku', '', ''],
        finalizing: ['Finalizowanie wysyłki', 'Jeszcze chwila', '', ''],
        uploading: [
          'Wysyłanie NiX',
          props.remainingCount > 1
            ? `Pozostało: ${props.remainingCount}`
            : 'Wysyłanie bezpiecznie w tle',
          '',
          '',
        ],
      }
    : {
        completed: ['Sent', 'NiX was sent', '', ''],
        failed: ['Upload failed', 'Tap to try again', 'Error', 'Error'],
        waiting_network: [
          'Waiting for network',
          'Will resume when connected',
          'Network',
          'Offline',
        ],
        paused: ['Upload paused', 'Open Inbox to resume', 'Paused', 'Paused'],
        preparing: ['Preparing NiX', 'Optimizing file', '', ''],
        finalizing: ['Finalizing upload', 'Almost done', '', ''],
        uploading: [
          'Sending NiX',
          props.remainingCount > 1
            ? `Remaining: ${props.remainingCount}`
            : 'Sending securely in the background',
          '',
          '',
        ],
      };
  const phases = {
    completed: {
      icon: 'checkmark.circle.fill',
      color: success,
      numericColor: success,
      showIcon: true,
      showPercent: true,
      showProgress: false,
    },
    failed: {
      icon: 'exclamationmark.triangle.fill',
      color: error,
      numericColor: error,
      showIcon: true,
      showPercent: false,
      showProgress: false,
    },
    waiting_network: {
      icon: 'wifi.slash',
      color: warning,
      numericColor: warning,
      showIcon: true,
      showPercent: false,
      showProgress: true,
    },
    paused: {
      icon: 'pause.circle.fill',
      color: accent,
      numericColor: muted,
      showIcon: true,
      showPercent: false,
      showProgress: false,
    },
    preparing: {
      icon: 'arrow.up.circle.fill',
      color: accent,
      numericColor: '#FFFFFF',
      showIcon: false,
      showPercent: true,
      showProgress: true,
    },
    finalizing: {
      icon: 'arrow.up.circle.fill',
      color: accent,
      numericColor: '#FFFFFF',
      showIcon: false,
      showPercent: true,
      showProgress: true,
    },
    uploading: {
      icon: 'arrow.up.circle.fill',
      color: accent,
      numericColor: '#FFFFFF',
      showIcon: false,
      showPercent: true,
      showProgress: true,
    },
  } as const;
  const phase = phases[props.phase];
  const [title, subtitle, compactLabel, expandedLabel] = copy[props.phase];
  const statusColor = phase.color;
  const progressValue = props.phase === 'preparing' ? null : progress;
  const leadingIndicator = phase.showIcon ? (
    <Image systemName={phase.icon} size={18} color={statusColor} />
  ) : (
    <ProgressView
      value={progressValue}
      modifiers={[
        progressViewStyle('circular'),
        tint(statusColor),
        frame({ width: 22, height: 22 }),
      ]}
    />
  );
  const trailingText = (expanded: boolean) => (
    <Text
      modifiers={[
        ...(expanded ? [padding({ trailing: 6 })] : []),
        font({
          weight: 'semibold',
          design: 'rounded',
          size: expanded ? (phase.showPercent ? 14 : 13) : phase.showPercent ? 13 : 12,
        }),
        ...(phase.showPercent ? [monospacedDigit(), contentTransition('numericText')] : []),
        foregroundStyle(phase.numericColor),
      ]}>
      {phase.showPercent ? percent : expanded ? expandedLabel : compactLabel}
    </Text>
  );

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
          <Text modifiers={[font({ weight: 'semibold', size: 16 }), foregroundStyle('#FFFFFF')]}>
            {title}
          </Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>{subtitle}</Text>
        </VStack>
        <Spacer />
        {phase.showPercent ? (
          <Text
            modifiers={[
              font({ weight: 'semibold', design: 'rounded', size: 17 }),
              monospacedDigit(),
              contentTransition('numericText'),
              foregroundStyle(phase.numericColor),
            ]}>
            {percent}
          </Text>
        ) : (
          <Image systemName="chevron.right" size={13} color={muted} />
        )}
      </HStack>
    ),
    compactLeading: leadingIndicator,
    compactTrailing: trailingText(false),
    minimal: leadingIndicator,
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
    expandedTrailing: trailingText(true),
    expandedBottom: (
      <VStack alignment="leading" spacing={7} modifiers={[padding({ horizontal: 6, bottom: 5 })]}>
        <Text modifiers={[font({ weight: 'semibold', size: 15 }), foregroundStyle('#FFFFFF')]}>
          {title}
        </Text>
        {phase.showProgress ? (
          <ProgressView
            value={progressValue}
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
