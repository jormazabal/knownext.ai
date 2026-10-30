use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};
pub const RATE: u64 = 24_000;
pub const MAX_CHUNK_SAMPLES: u64 = RATE * 300;

// Only one bounded fragment is materialized, regardless of meeting duration.
pub fn mix(root: &Path, start: u64, count: u64) -> Result<Vec<i16>, String> {
    if count > MAX_CHUNK_SAMPLES {
        return Err("Fragmento demasiado largo".into());
    }
    if !root.join("microphone.pcm").exists() && !root.join("system.pcm").exists() {
        return Err("Los archivos de audio ya no están disponibles".into());
    }
    let mut output = vec![0i32; count as usize];
    for name in ["microphone.pcm", "system.pcm"] {
        let path = root.join(name);
        if !path.exists() {
            continue;
        }
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        file.seek(SeekFrom::Start(start * 2))
            .map_err(|e| e.to_string())?;
        let mut bytes = vec![0; count as usize * 2];
        let mut read = 0;
        while read < bytes.len() {
            let n = file.read(&mut bytes[read..]).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            read += n;
        }
        for (index, pair) in bytes[..read - read % 2].chunks_exact(2).enumerate() {
            output[index] += i16::from_le_bytes([pair[0], pair[1]]) as i32;
        }
    }
    // Static headroom when mixing two sources, no loudness pumping.
    let divisor = if root.join("microphone.pcm").exists() && root.join("system.pcm").exists() {
        2
    } else {
        1
    };
    Ok(output
        .into_iter()
        .map(|v| (v / divisor).clamp(-32768, 32767) as i16)
        .collect())
}
pub fn wav(samples: &[i16]) -> Vec<u8> {
    let size = samples.len() as u32 * 2;
    let mut b = Vec::with_capacity(size as usize + 44);
    b.extend(b"RIFF");
    b.extend((size + 36).to_le_bytes());
    b.extend(b"WAVEfmt ");
    b.extend(16u32.to_le_bytes());
    b.extend(1u16.to_le_bytes());
    b.extend(1u16.to_le_bytes());
    b.extend((RATE as u32).to_le_bytes());
    b.extend((RATE as u32 * 2).to_le_bytes());
    b.extend(2u16.to_le_bytes());
    b.extend(16u16.to_le_bytes());
    b.extend(b"data");
    b.extend(size.to_le_bytes());
    for s in samples {
        b.extend(s.to_le_bytes());
    }
    b
}
pub fn cut(samples: &[i16], final_chunk: bool) -> usize {
    if final_chunk || samples.len() < RATE as usize * 10 {
        return samples.len();
    }
    let window = 2400;
    let begin = samples.len().saturating_sub(RATE as usize * 5);
    samples[begin..]
        .chunks(window)
        .enumerate()
        .filter(|(_, p)| p.len() == window && p.iter().all(|s| s.unsigned_abs() < 250))
        .map(|(i, _)| begin + (i + 1) * window)
        .last()
        .unwrap_or(samples.len())
}

pub fn checksum(samples: &[i16]) -> String {
    use sha2::{Digest, Sha256};
    let mut digest = Sha256::new();
    for sample in samples {
        digest.update(sample.to_le_bytes());
    }
    format!("{:x}", digest.finalize())
}
