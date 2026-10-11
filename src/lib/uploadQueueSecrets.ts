import { AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import { accountEncryptionKeys } from './accountEncryptionKeys';

const KEY_PREFIX = 'nix.upload-queue.key.v1';

/** Capability values that must never sit in the upload queue database in plaintext. */
export type UploadQueueSecrets = {
  uploadUrl: string | null;
  finalizeToken: string | null;
};

export type UploadQueueSecretsCodec = {
  seal(ownerId: string, jobId: string, secrets: UploadQueueSecrets): Promise<string>;
  open(ownerId: string, jobId: string, sealed: string): Promise<UploadQueueSecrets>;
  clear(ownerId: string): Promise<void>;
};

function keyName(ownerId: string) {
  return `${KEY_PREFIX}.${ownerId}`;
}

// Binds the ciphertext to its row, so it cannot be moved to another job or owner.
function additionalData(ownerId: string, jobId: string) {
  return new TextEncoder().encode(JSON.stringify(['nix-upload-queue', 1, ownerId, jobId]));
}

export const uploadQueueSecretsCodec: UploadQueueSecretsCodec = {
  async seal(ownerId, jobId, secrets) {
    const key = await accountEncryptionKeys.get(keyName(ownerId));
    const plaintext = new TextEncoder().encode(JSON.stringify(secrets));
    const sealed = await aesEncryptAsync(plaintext, key, {
      additionalData: additionalData(ownerId, jobId),
    });
    return sealed.combined('base64');
  },
  async open(ownerId, jobId, sealed) {
    const key = await accountEncryptionKeys.get(keyName(ownerId));
    const plaintext = await aesDecryptAsync(AESSealedData.fromCombined(sealed), key, {
      additionalData: additionalData(ownerId, jobId),
    });
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<UploadQueueSecrets>;
    return {
      uploadUrl: typeof parsed.uploadUrl === 'string' ? parsed.uploadUrl : null,
      finalizeToken: typeof parsed.finalizeToken === 'string' ? parsed.finalizeToken : null,
    };
  },
  clear: (ownerId) => accountEncryptionKeys.clear(keyName(ownerId)),
};
