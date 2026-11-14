import Foundation
import LocalAuthentication

/// BiometricManager: Wraps Apple LocalAuthentication for Face ID and Touch ID
public final class BiometricManager {
    public static let shared = BiometricManager()
    
    private init() {}
    
    public func canAuthenticateWithBiometrics() -> Bool {
        let context = LAContext()
        var error: NSError?
        return context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
    }
    
    public func authenticate(reason: String = "Unlock NKB Cloud to access enterprise storage", completion: @escaping (Bool, Error?) -> Void) {
        let context = LAContext()
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
            DispatchQueue.main.async {
                completion(success, error)
            }
        }
    }
}
