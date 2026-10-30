#[cfg(not(windows))]
use crate::model::Device;
use crate::model::Settings;

#[cfg(windows)]
mod windows {
    use super::Settings;
    use crate::model::Device;
    use wasapi::*;
    pub struct Source {
        client: AudioClient,
        capture: AudioCaptureClient,
        pub index: usize,
        name: String,
    }
    impl Drop for Source {
        fn drop(&mut self) {
            let _ = self.client.stop_stream();
        }
    }
    pub fn devices() -> Result<Vec<Device>, String> {
        initialize_mta().ok().map_err(|e| e.to_string())?;
        let en = DeviceEnumerator::new().map_err(|e| e.to_string())?;
        let mut devices = vec![];
        for (direction, kind) in [
            (Direction::Capture, "microphone"),
            (Direction::Render, "system"),
        ] {
            let collection = en
                .get_device_collection(&direction)
                .map_err(|e| e.to_string())?;
            for i in 0..collection.get_nbr_devices().map_err(|e| e.to_string())? {
                let d = collection
                    .get_device_at_index(i)
                    .map_err(|e| e.to_string())?;
                devices.push(Device {
                    id: d.get_id().map_err(|e| e.to_string())?,
                    name: d.get_friendlyname().map_err(|e| e.to_string())?,
                    kind: kind.into(),
                });
            }
        }
        Ok(devices)
    }
    pub fn open(settings: &Settings) -> Result<Vec<Source>, String> {
        initialize_mta().ok().map_err(|e| e.to_string())?;
        let en = DeviceEnumerator::new().map_err(|e| e.to_string())?;
        let mut sources = vec![];
        for (index, enabled, id, direction) in [
            (
                0,
                settings.microphone,
                &settings.microphone_device,
                Direction::Capture,
            ),
            (
                1,
                settings.system_audio,
                &settings.output_device,
                Direction::Render,
            ),
        ] {
            if !enabled {
                continue;
            }
            let device = match id {
                Some(id) => en.get_device(id),
                None => en.get_default_device(&direction),
            }
            .map_err(|e| e.to_string())?;
            let mut client = device.get_iaudioclient().map_err(|e| e.to_string())?;
            let format = WaveFormat::new(16, 16, &SampleType::Int, 24_000, 1, None);
            client
                .initialize_client(
                    &format,
                    &Direction::Capture,
                    &StreamMode::PollingShared {
                        autoconvert: true,
                        buffer_duration_hns: 2_000_000,
                    },
                )
                .map_err(|e| e.to_string())?;
            let capture = client.get_audiocaptureclient().map_err(|e| e.to_string())?;
            client.start_stream().map_err(|e| e.to_string())?;
            sources.push(Source {
                name:device.get_friendlyname().map_err(|e|e.to_string())?,
                client,
                capture,
                index,
            });
        }
        if sources.is_empty() {
            return Err("Activa al menos una entrada de audio".into());
        }
        Ok(sources)
    }
    pub fn resolve(settings: &mut Settings) -> Result<(), String> {
        initialize_mta().ok().map_err(|e| e.to_string())?;
        let en = DeviceEnumerator::new().map_err(|e| e.to_string())?;
        if settings.microphone && settings.microphone_device.is_none() {
            settings.microphone_device = Some(
                en.get_default_device(&Direction::Capture)
                    .and_then(|d| d.get_id())
                    .map_err(|e| e.to_string())?,
            );
        }
        if settings.system_audio && settings.output_device.is_none() {
            settings.output_device = Some(
                en.get_default_device(&Direction::Render)
                    .and_then(|d| d.get_id())
                    .map_err(|e| e.to_string())?,
            );
        }
        Ok(())
    }
    impl Source {
        pub fn read(&self) -> Result<Option<(u64, Vec<u8>)>, String> {
            let frames = self
                .capture
                .get_next_packet_size()
                .map_err(|e| format!("{} «{}»: {e}", if self.index==0 {"Micrófono"} else {"Salida de audio"},self.name))?
                .unwrap_or(0);
            if frames == 0 {
                return Ok(None);
            }
            if frames > 24_000 {
                return Err("El dispositivo ha excedido el búfer de captura".into());
            }
            let mut bytes = vec![0; frames as usize * 2];
            let (read, info) = self
                .capture
                .read_from_device(&mut bytes)
                .map_err(|e| format!("{} «{}»: {e}", if self.index==0 {"Micrófono"} else {"Salida de audio"},self.name))?;
            bytes.truncate(read as usize * 2);
            if info.flags.silent {
                bytes.fill(0);
            }
            Ok(Some((info.timestamp, bytes)))
        }
    }
}
#[cfg(windows)]
pub use windows::*;
#[cfg(not(windows))]
pub fn resolve(_: &mut Settings) -> Result<(), String> {
    Ok(())
}
#[cfg(not(windows))]
pub struct Source {
    pub index: usize,
}
#[cfg(not(windows))]
pub fn devices() -> Result<Vec<Device>, String> {
    Ok(vec![])
}
#[cfg(target_os = "android")]
pub fn open(_: &Settings) -> Result<Vec<Source>, String> {
    Ok(vec![])
}
#[cfg(not(any(windows, target_os = "android")))]
pub fn open(_: &Settings) -> Result<Vec<Source>, String> {
    Err("La captura requiere el adaptador nativo del dispositivo".into())
}
#[cfg(not(windows))]
impl Source {
    pub fn read(&self) -> Result<Option<(u64, Vec<u8>)>, String> {
        Ok(None)
    }
}
