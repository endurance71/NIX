import AuthenticationServices
import Foundation
import UIKit

/// Failure of one passkey ceremony. `code` is the stable value the JS wrapper maps to UI copy.
struct NixPasskeyFailure: Error {
  let code: String
  let message: String

  static func invalidInput(_ message: String) -> NixPasskeyFailure {
    NixPasskeyFailure(code: "ERR_PASSKEY_INVALID_INPUT", message: message)
  }

  static let busy = NixPasskeyFailure(
    code: "ERR_PASSKEY_BUSY",
    message: "Another passkey request is already in progress."
  )

  static func from(_ error: Error) -> NixPasskeyFailure {
    guard let authError = error as? ASAuthorizationError else {
      return NixPasskeyFailure(code: "ERR_PASSKEY_FAILED", message: error.localizedDescription)
    }
    switch authError.code {
    case .canceled:
      return NixPasskeyFailure(code: "ERR_PASSKEY_CANCELLED", message: "The user cancelled the request.")
    case .notInteractive:
      return NixPasskeyFailure(code: "ERR_PASSKEY_NOT_INTERACTIVE", message: authError.localizedDescription)
    default:
      // `.failed` also covers "the app is not associated with the domain" (missing or stale
      // webcredentials entry in the AASA file) — the JS side shows one generic message for it.
      return NixPasskeyFailure(code: "ERR_PASSKEY_FAILED", message: authError.localizedDescription)
    }
  }
}

/// base64url without padding (WebAuthn JSON encoding).
enum NixBase64URL {
  static func decode(_ value: String) -> Data? {
    var base64 = value
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let remainder = base64.count % 4
    if remainder > 0 {
      base64 += String(repeating: "=", count: 4 - remainder)
    }
    return Data(base64Encoded: base64)
  }

  static func encode(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

/// One ASAuthorizationController run. Only one ceremony may be active at a time; the static
/// reference keeps the controller and its delegate alive until the system sheet finishes.
final class NixPasskeyCeremony: NSObject, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding
{
  typealias Completion = (Result<[String: Any], NixPasskeyFailure>) -> Void

  private static var active: NixPasskeyCeremony?

  private var controller: ASAuthorizationController?
  private var completion: Completion?

  /// Must be called on the main queue.
  static func run(_ request: ASAuthorizationRequest, completion: @escaping Completion) {
    guard active == nil else {
      completion(.failure(.busy))
      return
    }
    let ceremony = NixPasskeyCeremony()
    active = ceremony
    ceremony.completion = completion
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = ceremony
    controller.presentationContextProvider = ceremony
    ceremony.controller = controller
    controller.performRequests()
  }

  static func assertionRequest(
    rpId: String,
    challenge: String,
    allowCredentialIds: [String],
    userVerification: String
  ) throws -> ASAuthorizationRequest {
    guard !rpId.isEmpty else { throw NixPasskeyFailure.invalidInput("Missing relying party id.") }
    guard let challengeData = NixBase64URL.decode(challenge), !challengeData.isEmpty else {
      throw NixPasskeyFailure.invalidInput("Invalid challenge.")
    }
    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
    let request = provider.createCredentialAssertionRequest(challenge: challengeData)
    request.allowedCredentials = allowCredentialIds.compactMap { id in
      NixBase64URL.decode(id).map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
    }
    request.userVerificationPreference =
      ASAuthorizationPublicKeyCredentialUserVerificationPreference(rawValue: userVerification)
    return request
  }

  static func registrationRequest(
    rpId: String,
    challenge: String,
    userId: String,
    userName: String,
    excludeCredentialIds: [String],
    userVerification: String
  ) throws -> ASAuthorizationRequest {
    guard !rpId.isEmpty else { throw NixPasskeyFailure.invalidInput("Missing relying party id.") }
    guard let challengeData = NixBase64URL.decode(challenge), !challengeData.isEmpty else {
      throw NixPasskeyFailure.invalidInput("Invalid challenge.")
    }
    guard let userIdData = NixBase64URL.decode(userId), !userIdData.isEmpty else {
      throw NixPasskeyFailure.invalidInput("Invalid user id.")
    }
    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
    let request = provider.createCredentialRegistrationRequest(
      challenge: challengeData,
      name: userName,
      userID: userIdData
    )
    request.userVerificationPreference =
      ASAuthorizationPublicKeyCredentialUserVerificationPreference(rawValue: userVerification)
    if #available(iOS 17.4, *) {
      request.excludedCredentials = excludeCredentialIds.compactMap { id in
        NixBase64URL.decode(id).map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
      }
    }
    return request
  }

  private func finish(_ result: Result<[String: Any], NixPasskeyFailure>) {
    let completion = self.completion
    self.completion = nil
    controller = nil
    if NixPasskeyCeremony.active === self {
      NixPasskeyCeremony.active = nil
    }
    completion?(result)
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    switch authorization.credential {
    case let assertion as ASAuthorizationPlatformPublicKeyCredentialAssertion:
      var result: [String: Any] = [
        "credentialId": NixBase64URL.encode(assertion.credentialID),
        "clientDataJSON": NixBase64URL.encode(assertion.rawClientDataJSON),
        "authenticatorData": NixBase64URL.encode(assertion.rawAuthenticatorData ?? Data()),
        "signature": NixBase64URL.encode(assertion.signature ?? Data()),
      ]
      if let userID = assertion.userID, !userID.isEmpty {
        result["userHandle"] = NixBase64URL.encode(userID)
      }
      finish(.success(result))
    case let registration as ASAuthorizationPlatformPublicKeyCredentialRegistration:
      guard let attestation = registration.rawAttestationObject else {
        finish(.failure(NixPasskeyFailure(code: "ERR_PASSKEY_FAILED", message: "Missing attestation object.")))
        return
      }
      finish(.success([
        "credentialId": NixBase64URL.encode(registration.credentialID),
        "clientDataJSON": NixBase64URL.encode(registration.rawClientDataJSON),
        "attestationObject": NixBase64URL.encode(attestation),
      ]))
    default:
      finish(.failure(NixPasskeyFailure(code: "ERR_PASSKEY_FAILED", message: "Unsupported credential type.")))
    }
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    finish(.failure(NixPasskeyFailure.from(error)))
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let foreground = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    if let window = foreground?.windows.first(where: { $0.isKeyWindow }) ?? foreground?.windows.first {
      return window
    }
    return ASPresentationAnchor()
  }
}
