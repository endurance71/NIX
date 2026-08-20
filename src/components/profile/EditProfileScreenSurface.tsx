import { useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FieldGroup, RNHostView, Text as NativeText } from '@expo/ui';
import { font, foregroundStyle, frame, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useAuth } from '../../hooks/useAuth';
import {
  AVATAR_SIGNED_URL_STALE_TIME_MS,
  clearProfileAvatar,
  createSignedAvatarUrls,
} from '../../services/avatarService';
import { getCurrentUserProfile, updateCurrentUserProfile } from '../../services/profileService';
import { avatarSignedUrlsQueryKey, queryKeys } from '../../lib/queryKeys';
import {
  DISPLAY_NAME_MAX_LENGTH,
  PROFILE_BIO_MAX_LENGTH,
  isProfileBioTooLong,
  normalizeDisplayName,
  normalizeProfileBio,
  validateDisplayName,
} from '../../lib/profileEdit';
import {
  handleProfileAvatarPickError,
  pickProfileAvatarPhoto,
  type AvatarPhotoSource,
} from '../../lib/profileScreenActions';
import { notifyError, notifySuccess } from '../../lib/appNotify';
import { runWithFinally } from '../../lib/runWithFinally';
import { APP_ICON_SIZE } from '../../theme/app-icons';
import { APP_FONT_FAMILY } from '../../theme/typography';
import { AppIcon } from '../ui/app-icon';
import { AvatarCircle } from '../ui/avatar-circle';
import { AppBottomSheet } from '../ui/app-bottom-sheet';
import {
  ActionSheetPrimaryButton,
  ActionSheetSecondaryButton,
  ActionSheetSurface,
} from '../ui/action-sheet-surface';
import { NativeSettingsRow } from '../ui/native-settings';
import { SettingsListScreen } from '../ui/settings-list-screen';

type EditableProfileField = 'display_name' | 'bio';

type EditorState = {
  field: EditableProfileField;
  initialValue: string;
};

function ProfileFieldValue({ value, muted = false }: { value: string; muted?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <NativeText
      modifiers={[
        font({ textStyle: 'body' }),
        foregroundStyle(muted ? colors.tertiaryLabel : colors.secondaryLabel),
        lineLimit(1),
        frame({ maxWidth: 210, alignment: 'trailing' }),
      ]}>
      {value}
    </NativeText>
  );
}

function ProfileFieldEditorSheet({
  editor,
  busy,
  onCancel,
  onSave,
}: {
  editor: EditorState;
  busy: boolean;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [value, setValue] = useState(editor.initialValue);
  const isDisplayName = editor.field === 'display_name';
  const maxLength = isDisplayName ? DISPLAY_NAME_MAX_LENGTH : PROFILE_BIO_MAX_LENGTH;
  const displayNameError = isDisplayName ? validateDisplayName(value) : null;
  const bioTooLong = !isDisplayName && isProfileBioTooLong(value);
  const normalizedValue = isDisplayName ? normalizeDisplayName(value) : normalizeProfileBio(value) ?? '';
  const normalizedInitial = isDisplayName
    ? normalizeDisplayName(editor.initialValue)
    : normalizeProfileBio(editor.initialValue) ?? '';
  const unchanged = normalizedValue === normalizedInitial;
  const invalid = Boolean(displayNameError) || bioTooLong;
  const errorMessage = displayNameError === 'required'
    ? t('profile.displayNameRequired')
    : displayNameError === 'too_long'
      ? t('profile.displayNameTooLong', { count: DISPLAY_NAME_MAX_LENGTH })
      : bioTooLong
        ? t('profile.bioTooLong', { count: PROFILE_BIO_MAX_LENGTH })
        : null;

  const submit = () => {
    if (!busy && !invalid && !unchanged) onSave(value);
  };

  return (
    <ActionSheetSurface
      title={t(isDisplayName ? 'profile.editDisplayNameTitle' : 'profile.editBioTitle')}
      message={t(isDisplayName ? 'profile.editDisplayNameMessage' : 'profile.editBioMessage')}
      contentAlign="stretch"
      nativeBottomSheet
      actions={
        <>
          <ActionSheetPrimaryButton
            label={t('common.save')}
            loading={busy}
            disabled={invalid || unchanged}
            onPress={submit}
          />
          <ActionSheetSecondaryButton
            label={t('common.cancel')}
            disabled={busy}
            onPress={onCancel}
          />
        </>
      }>
      <View>
        <TextInput
          autoFocus
          multiline={!isDisplayName}
          value={value}
          onChangeText={setValue}
          onSubmitEditing={isDisplayName ? submit : undefined}
          returnKeyType={isDisplayName ? 'done' : 'default'}
          blurOnSubmit={isDisplayName}
          editable={!busy}
          selectionColor={colors.accent}
          placeholder={t(isDisplayName ? 'profile.displayNamePlaceholder' : 'profile.bioPlaceholder')}
          placeholderTextColor={colors.tertiaryLabel}
          style={[
            styles.editorInput,
            !isDisplayName && styles.editorInputMultiline,
            {
              color: colors.label,
              backgroundColor: colors.secondarySystemGroupedBackground,
              borderColor: errorMessage ? colors.destructive : colors.separator,
            },
          ]}
          testID={`profile-${editor.field}-input`}
        />
        <View style={styles.editorMeta}>
          <Text style={[styles.editorError, { color: colors.destructive }]} numberOfLines={2}>
            {errorMessage ?? ' '}
          </Text>
          <Text
            style={[
              styles.characterCount,
              { color: value.length > maxLength ? colors.destructive : colors.tertiaryLabel },
            ]}>
            {value.length}/{maxLength}
          </Text>
        </View>
      </View>
    </ActionSheetSurface>
  );
}

export default function EditProfileScreenSurface() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [fieldBusy, setFieldBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const { data: profileRow = null, isPending: profilePending } = useQuery({
    queryKey: queryKeys.currentUserProfile(user?.id ?? null),
    queryFn: getCurrentUserProfile,
    staleTime: 1000 * 60 * 5,
  });
  const avatarPaths = profileRow?.avatar_storage_path ? [profileRow.avatar_storage_path] : [];
  const { data: avatarUrls = {} } = useQuery({
    queryKey: avatarSignedUrlsQueryKey(avatarPaths),
    queryFn: () => createSignedAvatarUrls(avatarPaths),
    enabled: avatarPaths.length > 0,
    staleTime: AVATAR_SIGNED_URL_STALE_TIME_MS,
  });
  const avatarUrl = profileRow?.avatar_storage_path
    ? avatarUrls[profileRow.avatar_storage_path] ?? null
    : null;
  const hasAvatar = Boolean(profileRow?.avatar_storage_path || profileRow?.avatar_emoji);
  const fallbackInitial = (profileRow?.display_name || profileRow?.username || user?.email || '?')
    .trim()
    .charAt(0)
    .toUpperCase();
  const contact = user?.email
    ? { label: t('profile.email'), value: user.email }
    : user?.phone
      ? { label: t('profile.phone'), value: user.phone }
      : null;

  const invalidateProfileData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.currentUserProfile(user?.id ?? null) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.acceptedFriends }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inboxNixesBundle }),
    ]);
  };

  const saveField = async (value: string) => {
    if (!editor || fieldBusy) return;
    const field = editor.field;
    setFieldBusy(true);
    await runWithFinally(
      async () => {
        try {
          await updateCurrentUserProfile(
            field === 'display_name'
              ? { display_name: normalizeDisplayName(value) }
              : { bio: normalizeProfileBio(value) }
          );
          await invalidateProfileData();
          notifySuccess(t('profile.profileFieldUpdated'));
          setEditor(null);
        } catch {
          notifyError(t('profile.profileFieldUpdateFailed'));
        }
      },
      () => setFieldBusy(false)
    );
  };

  const chooseAvatar = async (source: AvatarPhotoSource) => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    await runWithFinally(
      () => pickProfileAvatarPhoto(invalidateProfileData, source),
      () => setAvatarBusy(false)
    ).catch(handleProfileAvatarPickError);
  };

  const confirmRemoveAvatar = () => {
    Alert.alert(t('profile.removeAvatarConfirmTitle'), t('profile.removeAvatarConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.removeAvatar'),
        style: 'destructive',
        onPress: () => {
          setAvatarBusy(true);
          void runWithFinally(
            async () => {
              try {
                await clearProfileAvatar();
                await invalidateProfileData();
                notifySuccess(t('profile.avatarRemoved'));
              } catch {
                notifyError(t('profile.avatarRemoveFailure'));
              }
            },
            () => setAvatarBusy(false)
          );
        },
      },
    ]);
  };

  const openAvatarMenu = () => {
    if (avatarBusy) return;
    if (Platform.OS === 'ios') {
      const options = [
        t('profile.takePhoto'),
        t('profile.choosePhoto'),
        ...(hasAvatar ? [t('profile.removeAvatar')] : []),
        t('common.cancel'),
      ];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: hasAvatar ? 2 : undefined,
        },
        (index) => {
          if (index === 0) void chooseAvatar('camera');
          if (index === 1) void chooseAvatar('library');
          if (hasAvatar && index === 2) confirmRemoveAvatar();
        }
      );
      return;
    }

    Alert.alert(t('profile.editPhoto'), undefined, [
      { text: t('profile.takePhoto'), onPress: () => void chooseAvatar('camera') },
      { text: t('profile.choosePhoto'), onPress: () => void chooseAvatar('library') },
      ...(hasAvatar
        ? [{ text: t('profile.removeAvatar'), style: 'destructive' as const, onPress: confirmRemoveAvatar }]
        : []),
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <>
      <SettingsListScreen loading={profilePending}>
        <FieldGroup.Section>
          <FieldGroup.SectionHeader>
            <RNHostView matchContents>
              <View style={styles.hero}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.editPhoto')}
                  disabled={avatarBusy}
                  onPress={openAvatarMenu}
                  style={({ pressed }) => [
                    styles.avatarButton,
                    pressed && styles.pressed,
                    avatarBusy && styles.busy,
                  ]}>
                  <AvatarCircle
                    size={116}
                    url={avatarUrl}
                    storagePath={profileRow?.avatar_storage_path ?? null}
                    emoji={profileRow?.avatar_emoji ?? null}
                    fallbackInitial={fallbackInitial}
                  />
                  <View
                    style={[
                      styles.cameraBadge,
                      {
                        backgroundColor: colors.accent,
                        borderColor: colors.secondarySystemBackground,
                      },
                    ]}>
                    {avatarBusy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <AppIcon name="camera" size={APP_ICON_SIZE.md} color="#FFFFFF" />
                    )}
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={avatarBusy}
                  hitSlop={8}
                  onPress={openAvatarMenu}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <Text style={[styles.editPhotoLabel, { color: colors.accent }]}>
                    {avatarBusy ? t('profile.changeAvatarLoading') : t('profile.editPhoto')}
                  </Text>
                </Pressable>
              </View>
            </RNHostView>
          </FieldGroup.SectionHeader>

          <NativeSettingsRow
            title={t('profile.displayName')}
            trailing={
              <ProfileFieldValue
                value={profileRow?.display_name?.trim() || t('profile.notSet')}
                muted={!profileRow?.display_name?.trim()}
              />
            }
            showsChevron
            onPress={() =>
              setEditor({ field: 'display_name', initialValue: profileRow?.display_name ?? '' })
            }
            testID="edit-profile-display-name"
          />
          <NativeSettingsRow
            title={t('profile.about')}
            trailing={
              <ProfileFieldValue
                value={profileRow?.bio?.trim() || t('profile.addBio')}
                muted={!profileRow?.bio?.trim()}
              />
            }
            showsChevron
            onPress={() => setEditor({ field: 'bio', initialValue: profileRow?.bio ?? '' })}
            testID="edit-profile-bio"
          />
          <NativeSettingsRow
            title={t('profile.username')}
            trailing={
              <ProfileFieldValue value={`@${profileRow?.username ?? t('profile.missingUsername')}`} />
            }
            testID="edit-profile-username"
          />
          {contact ? (
            <NativeSettingsRow
              title={contact.label}
              trailing={<ProfileFieldValue value={contact.value} />}
              testID="edit-profile-contact"
            />
          ) : null}
          <FieldGroup.SectionFooter>
            <NativeText
              modifiers={[
                font({ textStyle: 'footnote' }),
                foregroundStyle(colors.secondaryLabel),
                lineLimit(2),
              ]}>
              {t('profile.bioVisibilityHint')}
            </NativeText>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
      </SettingsListScreen>
      <Stack.Screen.Title style={{ color: colors.label }}>{t('profile.editProfile')}</Stack.Screen.Title>

      <AppBottomSheet
        isPresented={Boolean(editor)}
        onDismiss={() => {
          if (!fieldBusy) setEditor(null);
        }}
        testID="profile-field-editor-sheet">
        {editor ? (
          <ProfileFieldEditorSheet
            key={`${editor.field}-${editor.initialValue}`}
            editor={editor}
            busy={fieldBusy}
            onCancel={() => setEditor(null)}
            onSave={(value) => void saveField(value)}
          />
        ) : null}
      </AppBottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 24,
    gap: 14,
  },
  avatarButton: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPhotoLabel: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    fontFamily: APP_FONT_FAMILY,
  },
  editorInput: {
    width: '100%',
    minHeight: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: APP_FONT_FAMILY,
  },
  editorInputMultiline: {
    minHeight: 112,
    textAlignVertical: 'top',
  },
  editorMeta: {
    minHeight: 36,
    paddingTop: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  editorError: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: APP_FONT_FAMILY,
  },
  characterCount: {
    fontSize: 13,
    lineHeight: 17,
    fontVariant: ['tabular-nums'],
    fontFamily: APP_FONT_FAMILY,
  },
  pressed: {
    opacity: 0.62,
  },
  busy: {
    opacity: 0.76,
  },
});
