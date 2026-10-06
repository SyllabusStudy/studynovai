export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const RATE = 16000;
/** Each piece is short so every upload is small (~6 MB) and finishes fast. */
const CHUNK_SECONDS = 180;

export type AudioPiece = { audio: string; mimeType: string };

function wav(samples: Float32Array): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/**
 * Turns any recording or video into small, clean speech pieces: mono 16 kHz,
 * rumble removed, and quiet far-away voices lifted so the professor is clear.
 */
export async function prepareLectureAudio(blob: Blob): Promise<AudioPiece[]> {
  const raw = await blob.arrayBuffer();
  let decoded: AudioBuffer | null = null;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    decoded = await ctx.decodeAudioData(raw.slice(0));
    void ctx.close();
  } catch {
    decoded = null;
  }
  if (!decoded) {
    // Couldn't read it here — send the original if it's small enough.
    if (blob.size > 14 * 1024 * 1024) throw new Error("We couldn't read that file. Try an MP3, M4A or MP4 file.");
    return [{ audio: bytesToB64(new Uint8Array(raw)), mimeType: (blob.type || "audio/mpeg").split(";")[0]! }];
  }

  const length = Math.ceil(decoded.duration * RATE);
  const off = new OfflineAudioContext(1, length, RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  const hp = off.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 90;
  const lp = off.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 7500;
  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -42; comp.knee.value = 12; comp.ratio.value = 6;
  comp.attack.value = 0.004; comp.release.value = 0.25;
  src.connect(hp).connect(lp).connect(comp).connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const data = rendered.getChannelData(0);

  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  const gain = peak > 0 ? Math.min(8, 0.95 / peak) : 1;
  if (gain !== 1) for (let i = 0; i < data.length; i++) data[i] = data[i]! * gain;

  const pieces: AudioPiece[] = [];
  const step = CHUNK_SECONDS * RATE;
  for (let start = 0; start < data.length; start += step) {
    const part = data.subarray(start, Math.min(data.length, start + step));
    if (part.length < RATE) continue; // skip a sub-second tail
    pieces.push({ audio: bytesToB64(wav(part)), mimeType: "audio/wav" });
  }
  if (!pieces.length) throw new Error("That recording is too short to make notes from.");
  return pieces;
}
