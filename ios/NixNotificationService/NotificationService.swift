import Intents
import UserNotifications

/// Turns NiX message notifications into communication notifications: the sender's avatar and
/// name instead of the app icon, Focus "allowed people" support, and one thread per conversation.
/// Anything missing (no avatar, older payload) falls back to the original notification.
final class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }
    bestAttempt = content

    let data = Self.payload(from: content.userInfo)
    guard let actorId = data["actorId"] as? String, !actorId.isEmpty else {
      contentHandler(content)
      return
    }
    content.threadIdentifier = actorId
    let senderName = (data["senderName"] as? String) ?? content.title
    let avatarURL = (data["senderAvatarUrl"] as? String).flatMap(URL.init(string:))

    Task {
      let avatar = await Self.loadAvatar(avatarURL)
      let updated = await Self.communicationContent(
        from: content,
        actorId: actorId,
        senderName: senderName,
        avatar: avatar
      )
      contentHandler(updated)
    }
  }

  override func serviceExtensionTimeWillExpire() {
    if let contentHandler, let bestAttempt { contentHandler(bestAttempt) }
  }

  /// Expo delivers the push `data` under `body`; older payloads may put it at the root.
  private static func payload(from userInfo: [AnyHashable: Any]) -> [String: Any] {
    if let body = userInfo["body"] as? [String: Any] { return body }
    if let body = userInfo["body"] as? String,
       let json = body.data(using: .utf8),
       let parsed = try? JSONSerialization.jsonObject(with: json) as? [String: Any] {
      return parsed
    }
    var root: [String: Any] = [:]
    for (key, value) in userInfo { if let key = key as? String { root[key] = value } }
    return root
  }

  private static func loadAvatar(_ url: URL?) async -> INImage? {
    guard let url else { return nil }
    var request = URLRequest(url: url)
    request.timeoutInterval = 8
    guard let (data, response) = try? await URLSession.shared.data(for: request),
          (response as? HTTPURLResponse)?.statusCode == 200,
          !data.isEmpty else { return nil }
    return INImage(imageData: data)
  }

  private static func communicationContent(
    from content: UNMutableNotificationContent,
    actorId: String,
    senderName: String,
    avatar: INImage?
  ) async -> UNNotificationContent {
    let sender = INPerson(
      personHandle: INPersonHandle(value: actorId, type: .unknown),
      nameComponents: nil,
      displayName: senderName,
      image: avatar,
      contactIdentifier: nil,
      customIdentifier: actorId
    )
    let intent = INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: nil,
      conversationIdentifier: actorId,
      serviceName: nil,
      sender: sender,
      attachments: nil
    )
    if let avatar { intent.setImage(avatar, forParameterNamed: \.sender) }
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    try? await interaction.donate()
    return (try? content.updating(from: intent)) ?? content
  }
}
