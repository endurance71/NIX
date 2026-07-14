import { useState, useRef } from 'react';

/**
 * Tracks TextInput text for submit handlers. On Android, reading
 * `ObservableState.value` from the JS thread right after typing can return a
 * stale empty string — `onChangeText` snapshots stay in sync.
 */
function useTrackedNativeString(initial = '') {
  const [value, setValue] = useState(initial);
  const snapshotRef = useRef(initial);

  const onChangeText = (text: string) => {
    snapshotRef.current = text;
    setValue(text);
  };

  const getValue = () => snapshotRef.current;

  // Mock ObservableState for standard React inputs
  const state = { value };

  return { state, onChangeText, getValue };
}

export function useTrackedEmail() {
  const email = useTrackedNativeString();

  return {
    email: email.state,
    onEmailChange: email.onChangeText,
    getTrimmedEmail: () => email.getValue().trim().toLowerCase(),
  };
}

export function useAuthRegisterCredentials() {
  const email = useTrackedNativeString();
  const password = useTrackedNativeString();
  const confirmPassword = useTrackedNativeString();

  const getTrimmedEmail = () => email.getValue().trim().toLowerCase();
  const getPassword = () => password.getValue();
  const getConfirmPassword = () => confirmPassword.getValue();

  return {
    email: email.state,
    password: password.state,
    confirmPassword: confirmPassword.state,
    onEmailChange: email.onChangeText,
    onPasswordChange: password.onChangeText,
    onConfirmPasswordChange: confirmPassword.onChangeText,
    getTrimmedEmail,
    getPassword,
    getConfirmPassword,
  };
}

export function useAuthPasswordPair() {
  const password = useTrackedNativeString();
  const confirmPassword = useTrackedNativeString();

  const getPassword = () => password.getValue();
  const getConfirmPassword = () => confirmPassword.getValue();

  return {
    password: password.state,
    confirmPassword: confirmPassword.state,
    onPasswordChange: password.onChangeText,
    onConfirmPasswordChange: confirmPassword.onChangeText,
    getPassword,
    getConfirmPassword,
  };
}

export function useTrackedUsername() {
  const username = useTrackedNativeString();

  return {
    username: username.state,
    onUsernameChange: username.onChangeText,
    getUsername: () => username.getValue(),
  };
}
