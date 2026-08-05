import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export interface FFmpegResult {
  success: boolean;
  outputPath: string;
  duration: number;
  fileSize: number;
  videoCodec: string;
  audioCodec: string;
  resolution: string;
  error?: string;
}

async function ffmpeg(args: string[], timeout = 600000): Promise<void> {
  await execFileAsync('ffmpeg', args, { timeout, maxBuffer: 8 * 1024 * 1024 });
}

async function ffprobe(args: string[]): Promise<string> {
  const result = await execFileAsync('ffprobe', args, { timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  return result.stdout;
}

export async function checkFFmpeg(): Promise<boolean> {
  try {
    await ffmpeg(['-version'], 15000);
    await ffprobe(['-version']);
    return true;
  } catch {
    return false;
  }
}

export async function getVideoInfo(filePath: string): Promise<Record<string, unknown>> {
  try {
    const stdout = await ffprobe([
      '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath,
    ]);
    return JSON.parse(stdout);
  } catch (error) {
    logger.error(`ffprobe failed for ${filePath}: ${error}`);
    throw error;
  }
}

export async function extractFrame(videoPath: string, outputPath: string, timeSeconds: number): Promise<string> {
  await ffmpeg(['-y', '-ss', String(timeSeconds), '-i', videoPath, '-frames:v', '1', '-q:v', '2', outputPath]);
  return outputPath;
}

export async function extractFirstFrame(videoPath: string, outputPath: string): Promise<string> {
  return extractFrame(videoPath, outputPath, 0);
}

export async function extractLastFrame(videoPath: string, outputPath: string): Promise<string> {
  const info = await getVideoInfo(videoPath);
  const duration = Number((info.format as Record<string, unknown>)?.duration || 0);
  return extractFrame(videoPath, outputPath, Math.max(0, duration - 0.1));
}

export async function generateThumbnail(videoPath: string, outputPath: string): Promise<string> {
  await ffmpeg(['-y', '-ss', '1', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=640:-2', outputPath]);
  return outputPath;
}

async function normalizeClip(
  inputPath: string,
  outputPath: string,
  resolution: string,
  frameRate: number
): Promise<void> {
  const [width, height] = resolution.split('x').map(Number);
  if (!width || !height) throw new Error(`Invalid resolution: ${resolution}`);
  await ffmpeg([
    '-y', '-i', inputPath,
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    '-r', String(frameRate),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', outputPath,
  ]);
}

export async function concatenateVideos(
  clipPaths: string[],
  outputPath: string,
  options: { resolution?: string; frameRate?: number } = {}
): Promise<FFmpegResult> {
  const tempDir = path.dirname(outputPath);
  const resolution = options.resolution || '1920x1080';
  const frameRate = options.frameRate || 24;
  const normalized: string[] = [];
  const listPath = path.join(tempDir, `concat_${Date.now()}.txt`);

  try {
    for (let index = 0; index < clipPaths.length; index += 1) {
      const normalizedPath = path.join(tempDir, `normalized_${index}.mp4`);
      await normalizeClip(clipPaths[index], normalizedPath, resolution, frameRate);
      normalized.push(normalizedPath);
    }
    await fs.writeFile(listPath, normalized.map((item) => `file '${item.replace(/'/g, "'\\''")}'`).join('\n'));
    await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', outputPath]);

    const info = await getVideoInfo(outputPath);
    const stat = await fs.stat(outputPath);
    const streams = (info.streams as Array<Record<string, unknown>>) || [];
    return {
      success: true,
      outputPath,
      duration: Number((info.format as Record<string, unknown>)?.duration || 0),
      fileSize: stat.size,
      videoCodec: String(streams.find((s) => s.codec_type === 'video')?.codec_name || ''),
      audioCodec: String(streams.find((s) => s.codec_type === 'audio')?.codec_name || ''),
      resolution,
    };
  } catch (error) {
    return {
      success: false,
      outputPath,
      duration: 0,
      fileSize: 0,
      videoCodec: '',
      audioCodec: '',
      resolution,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await fs.unlink(listPath).catch(() => undefined);
    await Promise.all(normalized.map((item) => fs.unlink(item).catch(() => undefined)));
  }
}
