import { StyleSheet } from 'react-native';
import { typography } from '../../theme/typography';
import { SWIFT_UI_INSET_GROUPED_LIST_RN_ROW_PADDING } from '../../theme/swiftUiEmbeddedLayout';

export const profileScreenRnStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarActions: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  avatarLink: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  avatarLinkPressed: {
    opacity: 0.6,
  },
  avatarLinkText: {
    ...typography.headline,
    fontWeight: '500',
  },
  socialRow: {
    gap: 8,
    paddingVertical: 6,
    ...SWIFT_UI_INSET_GROUPED_LIST_RN_ROW_PADDING,
  },
  socialTitle: {
    ...typography.headline,
  },
  socialActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  socialActionLabel: {
    ...typography.headline,
    fontWeight: '600',
  },
  outgoingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  outgoingStatusLabel: {
    ...typography.footnote,
    paddingLeft: 46,
  },
  captureToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingLeft: 46,
  },
  captureToggleLabel: {
    ...typography.footnote,
    flex: 1,
    minWidth: 0,
    lineHeight: 18,
  },
  rowDisabled: {
    opacity: 0.82,
  },
});
