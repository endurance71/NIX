import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { appNotificationQueue } from '../../lib/notificationQueue';

export function useNotificationAccessibility() {
  const initialReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  // Keep automatic dismissal disabled until the initial VoiceOver query resolves.
  const [screenReader, setScreenReader] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    let voiceOverChanged = false;
    let motionChanged = false;
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      voiceOverChanged = true;
      appNotificationQueue.setScreenReader(enabled);
      setScreenReader(enabled);
    });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      motionChanged = true;
      setReducedMotion(enabled);
    });
    appNotificationQueue.setScreenReader(true);
    void Promise.all([
      AccessibilityInfo.isScreenReaderEnabled(), AccessibilityInfo.isReduceMotionEnabled(),
    ]).then(([readerEnabled, motionEnabled]) => {
      if (!mounted) return;
      if (!voiceOverChanged) {
        appNotificationQueue.setScreenReader(readerEnabled);
        setScreenReader(readerEnabled);
      }
      if (!motionChanged) setReducedMotion(motionEnabled);
      setReady(true);
    }).catch(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
      reader.remove();
      motion.remove();
    };
  }, []);
  return { reducedMotion, screenReader, ready };
}
