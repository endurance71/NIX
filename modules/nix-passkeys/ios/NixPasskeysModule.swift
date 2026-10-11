import AuthenticationServices
import ExpoModulesCore

struct NixPasskeyAssertionOptions: Record {
  @Field var rpId: String = ""
  /// base64url
  @Field var challenge: String = ""
  /// base64url credential ids; empty = any discoverable passkey for the RP.
  @Field var allowCredentialIds: [String] = []
  @Field var userVerification: String = "preferred"
}

struct NixPasskeyRegistrationOptions: Record {
  @Field var rpId: String = ""
  /// base64url
  @Field var challenge: String = ""
  /// base64url user handle issued by the server.
  @Field var userId: String = ""
  @Field var userName: String = ""
  @Field var excludeCredentialIds: [String] = []
  @Field var userVerification: String = "preferred"
}

/// Platform passkeys (iCloud Keychain / password manager) for Supabase Auth's WebAuthn endpoints.
/// The JS wrapper builds the W3C JSON response from the base64url fields returned here.
public class NixPasskeysModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NixPasskeys")

    Function("isSupported") { () -> Bool in
      return true
    }

    AsyncFunction("getAssertionAsync") { (options: NixPasskeyAssertionOptions, promise: Promise) in
      do {
        let request = try NixPasskeyCeremony.assertionRequest(
          rpId: options.rpId,
          challenge: options.challenge,
          allowCredentialIds: options.allowCredentialIds,
          userVerification: options.userVerification
        )
        NixPasskeyCeremony.run(request) { result in
          Self.settle(promise, result)
        }
      } catch let failure as NixPasskeyFailure {
        promise.reject(failure.code, failure.message)
      } catch {
        promise.reject("ERR_PASSKEY_FAILED", error.localizedDescription)
      }
    }.runOnQueue(.main)

    AsyncFunction("createCredentialAsync") { (options: NixPasskeyRegistrationOptions, promise: Promise) in
      do {
        let request = try NixPasskeyCeremony.registrationRequest(
          rpId: options.rpId,
          challenge: options.challenge,
          userId: options.userId,
          userName: options.userName,
          excludeCredentialIds: options.excludeCredentialIds,
          userVerification: options.userVerification
        )
        NixPasskeyCeremony.run(request) { result in
          Self.settle(promise, result)
        }
      } catch let failure as NixPasskeyFailure {
        promise.reject(failure.code, failure.message)
      } catch {
        promise.reject("ERR_PASSKEY_FAILED", error.localizedDescription)
      }
    }.runOnQueue(.main)
  }

  private static func settle(_ promise: Promise, _ result: Result<[String: Any], NixPasskeyFailure>) {
    switch result {
    case .success(let value):
      promise.resolve(value)
    case .failure(let failure):
      promise.reject(failure.code, failure.message)
    }
  }
}
