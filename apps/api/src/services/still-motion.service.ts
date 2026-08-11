import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';

const execFileAsync = promisify(execFile);

export type StillMotionStyle = 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right';

export interface StillMotionOptions {
  durationSeconds: number;
  resolution: string;
  frameRate: number;
  style?: StillMotionStyle;
}

function dimensions(resolution: string): { width: number; height: number } {
  const [width, height] = String(resolution || '').split('x').map(Number);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 320 || width > 7680 || height > 7680) {
    throw new Error(`Invalid still-motion resolution: ${resolution}`);
  }
  return { width, height };
}

function filterFor(style: StillMotionStyle, width: number, height: number, frames: number, fps: number): string {
  const zoomFrames = Math.max(frames, 1);
  const common = `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2}`;
  const centreX = 'iw/2-(iw/zoom/2)';
  const centreY = 'ih/2-(ih/zoom/2)';

  if (style === 'zoom_out') {
    const zoom = `if(eq(on,1),1.08,max(1.0,1.08-(on/${zoomFrames})*0.08))`;
    return `${common},zoompan=z='${zoom}':x='${centreX}':y='${centreY}':d=${frames}:s=${width}x${height}:fps=${fps},format=yuv420p`;
  }
  if (style === 'pan_left') {
    const x = `(iw-iw/1.08)*(1-on/${zoomFrames})`;
    return `${common},zoompan=z='1.08':x='${x}':y='${centreY}':d=${frames}:s=${width}x${height}:fps=${fps},format=yuv420p`;
  }
  if (style === 'pan_right') {
    const x = `(iw-iw/1.08)*(on/${zoomFrames})`;
    return `${common},zoompan=z='1.08':x='${x}':y='${centreY}':d=${frames}:s=${width}x${height}:fps=${fps},format=yuv420p`;
  }
  const zoom = `min(1.0+(on/${zoomFrames})*0.08,1.08)`;
  return `${common},zoompan=z='${zoom}':x='${centreX}':y='${centreY}':d=${frames}:s=${width}x${height}:fps=${fps},format=yuv420p`;
}

export async function createStillMotionClip(
  imagePath: string,
  outputPath: string,
  options: StillMotionOptions
): Promise<{ outputPath: string; sizeBytes: number; durationSeconds: number; style: StillMotionStyle }> {
  const { width, height } = dimensions(options.resolution);
  const durationSeconds = Math.max(1, Math.min(Number(options.durationSeconds || 5), 60));
  const frameRate = Math.max(12, Math.min(Math.round(Number(options.frameRate || 24)), 60));
  const frames = Math.max(1, Math.ceil(durationSeconds * frameRate));
  const style = options.style || 'zoom_in';
  const filter = filterFor(style, width, height, frames, frameRate);

  await execFileAsync('ffmpeg', [
    '-y',
    '-loop', '1',
    '-i', imagePath,
    '-t', String(durationSeconds),
    '-vf', filter,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ], { timeout: 10 * 60_000, maxBuffer: 16 * 1024 * 1024 });

  const stat = await fs.stat(outputPath);
  if (stat.size < 1024) throw new Error('Local still-motion render produced an invalid output');
  return { outputPath, sizeBytes: stat.size, durationSeconds, style };
}

export default { createStillMotionClip };
