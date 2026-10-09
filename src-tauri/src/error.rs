use serde::{Serialize, Serializer};

/// Error type returned by every Tauri command. Serialized as a plain string so
/// the frontend can surface it directly.
#[derive(Debug)]
pub struct CmdError(pub String);

impl<E: std::fmt::Display> From<E> for CmdError {
    fn from(err: E) -> Self {
        CmdError(err.to_string())
    }
}

impl Serialize for CmdError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

pub type CmdResult<T> = Result<T, CmdError>;

pub fn err<T>(msg: impl Into<String>) -> CmdResult<T> {
    Err(CmdError(msg.into()))
}
