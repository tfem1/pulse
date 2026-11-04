//! Error type shared by the whole backend.
//!
//! Errors are serialised to the frontend as `{ kind, message }` so the UI can
//! show a precise, human-readable explanation (for example a permission error
//! when trying to kill a process owned by another user).

use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum PulseError {
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Not supported on this platform: {0}")]
    Unsupported(String),
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}

impl PulseError {
    pub fn kind(&self) -> &'static str {
        match self {
            PulseError::PermissionDenied(_) => "permissionDenied",
            PulseError::NotFound(_) => "notFound",
            PulseError::Unsupported(_) => "unsupported",
            PulseError::InvalidInput(_) => "invalidInput",
            PulseError::Io(_) => "io",
            PulseError::Other(_) => "other",
        }
    }

    /// Map an OS error produced while acting on a process into a precise variant.
    pub fn from_process_io(err: std::io::Error, action: &str, pid: u32) -> Self {
        match err.kind() {
            std::io::ErrorKind::PermissionDenied => PulseError::PermissionDenied(format!(
                "cannot {action} process {pid}: it belongs to another user or is protected. \
                 Run Pulse with elevated privileges to manage it."
            )),
            std::io::ErrorKind::NotFound => {
                PulseError::NotFound(format!("process {pid} no longer exists"))
            }
            _ => PulseError::Other(format!("cannot {action} process {pid}: {err}")),
        }
    }
}

impl Serialize for PulseError {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("PulseError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type Result<T> = std::result::Result<T, PulseError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_kind_and_message() {
        let e = PulseError::NotFound("process 42 no longer exists".into());
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["kind"], "notFound");
        assert!(v["message"].as_str().unwrap().contains("42"));
    }

    #[test]
    fn maps_permission_errors() {
        let io = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        let e = PulseError::from_process_io(io, "kill", 7);
        assert_eq!(e.kind(), "permissionDenied");
    }
}
