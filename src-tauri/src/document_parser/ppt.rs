//! Text extraction for legacy binary PowerPoint (.ppt, MS-PPT format).
//!
//! The "PowerPoint Document" stream is a tree of records. We resolve the
//! persist directory (via the CurrentUser stream and the UserEditAtom chain)
//! so that each slide in presentation order can be mapped to its
//! SlideContainer, then collect:
//!   * placeholder text from SlideListWithTextContainer (titles/bodies),
//!   * free text boxes from the slide's drawing (OfficeArtClientTextbox),
//!   * speaker notes from the notes SlideListWithTextContainer / NotesContainer.

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;

use serde::Serialize;

const RT_DOCUMENT: u16 = 0x03E8;
const RT_SLIDE: u16 = 0x03EE;
const RT_SLIDE_ATOM: u16 = 0x03EF;
const RT_NOTES: u16 = 0x03F0;
const RT_SLIDE_PERSIST_ATOM: u16 = 0x03F3;
const RT_TEXT_CHARS_ATOM: u16 = 0x0FA0;
const RT_TEXT_BYTES_ATOM: u16 = 0x0FA8;
const RT_SLIDE_LIST_WITH_TEXT: u16 = 0x0FF0;
const RT_USER_EDIT_ATOM: u16 = 0x0FF5;
const RT_PERSIST_DIRECTORY_ATOM: u16 = 0x1772;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PptSlide {
    pub slide_number: usize,
    pub texts: Vec<String>,
    pub notes: String,
}

#[derive(Clone, Copy, Debug)]
struct RecordHeader {
    ver: u8,
    instance: u16,
    rec_type: u16,
    len: usize,
}

fn u16_at(buf: &[u8], pos: usize) -> Option<u16> {
    buf.get(pos..pos + 2).map(|b| u16::from_le_bytes([b[0], b[1]]))
}

fn u32_at(buf: &[u8], pos: usize) -> Option<u32> {
    buf.get(pos..pos + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

fn header_at(buf: &[u8], pos: usize) -> Option<RecordHeader> {
    let ver_inst = u16_at(buf, pos)?;
    let rec_type = u16_at(buf, pos + 2)?;
    let len = u32_at(buf, pos + 4)? as usize;
    Some(RecordHeader {
        ver: (ver_inst & 0x000F) as u8,
        instance: ver_inst >> 4,
        rec_type,
        len,
    })
}

/// Iterate over the direct children of the record body `buf[start..end]`.
fn children(buf: &[u8], start: usize, end: usize) -> Vec<(RecordHeader, usize)> {
    let mut out = Vec::new();
    let mut pos = start;
    let end = end.min(buf.len());
    while pos + 8 <= end {
        let Some(h) = header_at(buf, pos) else { break };
        let body = pos + 8;
        if body + h.len > end {
            break;
        }
        out.push((h, body));
        pos = body + h.len;
    }
    out
}

fn decode_text_atom(h: &RecordHeader, buf: &[u8], body: usize) -> String {
    let bytes = &buf[body..body + h.len];
    let raw = if h.rec_type == RT_TEXT_CHARS_ATOM {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        // TextBytesAtom stores the low byte of each UTF-16 code unit.
        bytes.iter().map(|&b| b as char).collect()
    };
    raw.replace('\r', "\n").replace('\u{000B}', "\n").trim().to_string()
}

/// Recursively collect text atoms below a record body.
fn collect_text(buf: &[u8], start: usize, end: usize, out: &mut Vec<String>, depth: usize) {
    if depth > 32 {
        return;
    }
    for (h, body) in children(buf, start, end) {
        match h.rec_type {
            RT_TEXT_CHARS_ATOM | RT_TEXT_BYTES_ATOM => {
                let text = decode_text_atom(&h, buf, body);
                if !text.is_empty() && !is_placeholder_noise(&text) {
                    out.push(text);
                }
            }
            _ if h.ver == 0x0F => collect_text(buf, body, body + h.len, out, depth + 1),
            _ => {}
        }
    }
}

/// Master-slide prompt text sometimes leaks into slides; drop the obvious ones.
fn is_placeholder_noise(text: &str) -> bool {
    let t = text.to_ascii_lowercase();
    t.starts_with("click to edit") || t == "*" || t == "‹#›"
}

/// Build persistId -> stream offset by walking the UserEditAtom chain.
fn persist_directory(doc: &[u8], current_edit: usize) -> HashMap<u32, usize> {
    let mut dir = HashMap::new();
    let mut edit_offset = current_edit;
    let mut guard = 0;
    while guard < 256 {
        guard += 1;
        let Some(h) = header_at(doc, edit_offset) else { break };
        if h.rec_type != RT_USER_EDIT_ATOM {
            break;
        }
        let body = edit_offset + 8;
        let last_edit = u32_at(doc, body + 8).unwrap_or(0) as usize;
        let persist_offset = u32_at(doc, body + 12).unwrap_or(0) as usize;

        if let Some(ph) = header_at(doc, persist_offset) {
            if ph.rec_type == RT_PERSIST_DIRECTORY_ATOM {
                let mut pos = persist_offset + 8;
                let end = (pos + ph.len).min(doc.len());
                while pos + 4 <= end {
                    let entry = u32_at(doc, pos).unwrap_or(0);
                    let persist_id = entry & 0x000F_FFFF;
                    let count = (entry >> 20) as usize;
                    pos += 4;
                    for i in 0..count {
                        if let Some(off) = u32_at(doc, pos + i * 4) {
                            // Newer edits are visited first and win.
                            dir.entry(persist_id + i as u32).or_insert(off as usize);
                        }
                    }
                    pos += count * 4;
                }
            }
        }
        if last_edit == 0 || last_edit == edit_offset {
            break;
        }
        edit_offset = last_edit;
    }
    dir
}

struct ListEntry {
    persist_id: u32,
    slide_id: u32,
    texts: Vec<String>,
}

/// Parse a SlideListWithTextContainer into per-slide entries.
fn parse_slide_list(doc: &[u8], body: usize, len: usize) -> Vec<ListEntry> {
    let mut entries: Vec<ListEntry> = Vec::new();
    for (h, child) in children(doc, body, body + len) {
        match h.rec_type {
            RT_SLIDE_PERSIST_ATOM => entries.push(ListEntry {
                persist_id: u32_at(doc, child).unwrap_or(0),
                slide_id: u32_at(doc, child + 12).unwrap_or(0),
                texts: Vec::new(),
            }),
            RT_TEXT_CHARS_ATOM | RT_TEXT_BYTES_ATOM => {
                let text = decode_text_atom(&h, doc, child);
                if let Some(last) = entries.last_mut() {
                    if !text.is_empty() && !is_placeholder_noise(&text) {
                        last.texts.push(text);
                    }
                }
            }
            _ => {}
        }
    }
    entries
}

pub fn extract(path: &Path) -> anyhow::Result<Vec<PptSlide>> {
    let mut comp = cfb::open(path)?;

    let mut current_user = Vec::new();
    comp.open_stream("/Current User")?.read_to_end(&mut current_user)?;
    let mut doc = Vec::new();
    comp.open_stream("/PowerPoint Document")?.read_to_end(&mut doc)?;

    // CurrentUserAtom: header(8) size(4) headerToken(4) offsetToCurrentEdit(4)
    let current_edit = u32_at(&current_user, 16)
        .ok_or_else(|| anyhow::anyhow!("corrupt Current User stream"))? as usize;
    let dir = persist_directory(&doc, current_edit);

    // docPersistIdRef lives in the newest UserEditAtom.
    let doc_persist = u32_at(&doc, current_edit + 8 + 16).unwrap_or(1);
    let doc_offset = dir.get(&doc_persist).copied();

    // Locate the DocumentContainer (fall back to a linear scan for files with
    // a damaged persist directory).
    let doc_container = doc_offset
        .and_then(|off| header_at(&doc, off).map(|h| (h, off)))
        .filter(|(h, _)| h.rec_type == RT_DOCUMENT)
        .or_else(|| {
            children(&doc, 0, doc.len())
                .into_iter()
                .find(|(h, _)| h.rec_type == RT_DOCUMENT)
                .map(|(h, body)| (h, body - 8))
        })
        .ok_or_else(|| anyhow::anyhow!("no DocumentContainer found"))?;

    let (doc_h, doc_off) = doc_container;
    let mut slides_list = Vec::new();
    let mut notes_list = Vec::new();
    for (h, body) in children(&doc, doc_off + 8, doc_off + 8 + doc_h.len) {
        if h.rec_type == RT_SLIDE_LIST_WITH_TEXT {
            match h.instance {
                0 => slides_list = parse_slide_list(&doc, body, h.len),
                2 => notes_list = parse_slide_list(&doc, body, h.len),
                _ => {}
            }
        }
    }

    let notes_text_for = |notes_id: u32| -> String {
        // Notes placeholder text is listed in the notes SlideListWithText.
        if let Some(entry) = notes_list
            .iter()
            .find(|e| e.slide_id == notes_id || e.persist_id == notes_id)
        {
            if !entry.texts.is_empty() {
                return entry.texts.join("\n");
            }
            // Otherwise read the NotesContainer drawing itself.
            if let Some(&off) = dir.get(&entry.persist_id) {
                if let Some(h) = header_at(&doc, off) {
                    if h.rec_type == RT_NOTES {
                        let mut texts = Vec::new();
                        collect_text(&doc, off + 8, off + 8 + h.len, &mut texts, 0);
                        return texts.join("\n");
                    }
                }
            }
        }
        String::new()
    };

    let mut slides = Vec::new();
    for (index, entry) in slides_list.iter().enumerate() {
        let mut texts = entry.texts.clone();
        let mut notes = String::new();
        if let Some(&off) = dir.get(&entry.persist_id) {
            if let Some(h) = header_at(&doc, off) {
                if h.rec_type == RT_SLIDE {
                    let mut drawing_text = Vec::new();
                    collect_text(&doc, off + 8, off + 8 + h.len, &mut drawing_text, 0);
                    for t in drawing_text {
                        if !texts.contains(&t) {
                            texts.push(t);
                        }
                    }
                    // SlideAtom: geom(4) placeholders(8) masterIdRef(4) notesIdRef(4)
                    if let Some((_, atom)) = children(&doc, off + 8, off + 8 + h.len)
                        .into_iter()
                        .find(|(ch, _)| ch.rec_type == RT_SLIDE_ATOM)
                    {
                        let notes_id = u32_at(&doc, atom + 16).unwrap_or(0);
                        if notes_id != 0 {
                            notes = notes_text_for(notes_id);
                        }
                    }
                }
            }
        }
        slides.push(PptSlide { slide_number: index + 1, texts, notes });
    }

    if slides.is_empty() {
        anyhow::bail!("no slides found in this .ppt file");
    }
    Ok(slides)
}

#[cfg(test)]
mod tests {
    /// Runs against a real .ppt when `REFLEX_PPT_SAMPLE` points at one.
    #[test]
    fn extracts_sample_when_provided() {
        let Ok(path) = std::env::var("REFLEX_PPT_SAMPLE") else { return };
        let slides = super::extract(std::path::Path::new(&path)).expect("parse failed");
        for s in &slides {
            println!("slide {}: {:?} | notes: {:?}", s.slide_number, s.texts, s.notes);
        }
        assert!(!slides.is_empty());
        assert!(slides.iter().any(|s| !s.texts.is_empty()));
    }
}
