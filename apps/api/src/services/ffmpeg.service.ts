import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

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

export interface SceneClip {
  filePath: string;
  duration: number;
  transition?: string;
}

/**
 * Check if FFmpeg is installed and accessible
 */
export async function checkFFmpeg(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get video metadata using ffprobe
 */
export async function getVideoInfo(filePath: string): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    );
    return JSON.parse(stdout);
  } catch (error) {
    logger.error(`ffprobe failed for ${filePath}: ${error}`);
    throw new Error(`Failed to get video info: ${error}`);
  }
}

/**
 * Extract a single frame from a video
 */
export async function extractFrame(
  videoPath: string,
  outputPath: string,
  timeSeconds: number
): Promise<string> {
  await execAsync(
    `ffmpeg -y -ss ${timeSeconds} -i "${videoPath}" -frames:v 1 -q:v 2 "${outputPath}"`
  );
  return outputPath;
}

/**
 * Extract first frame from video
 */
export async function extractFirstFrame(videoPath: string, outputPath: string): Promise<string> {
  return extractFrame(videoPath, outputPath, 0);
}

/**
 * Extract last frame from video
 */
export async function extractLastFrame(videoPath: string, outputPath: string): Promise<string> {
  const info = await getVideoInfo(videoPath);
  const format = info.format as Record<string, unknown>;
  const duration = parseFloat(format.duration as string) || 0;
  return extractFrame(videoPath, outputPath, Math.max(0, duration - 0.1));
}

/**
 * Generate thumbnail from video
 */
export async function generateThumbnail(videoPath: string, outputPath: string): Promise<string> {
  await execAsync(
    `ffmpeg -y -i "${videoPath}" -ss 00:00:01 -vframes 1 -vf "scale=320:240" "${outputPath}"`
  );
  return outputPath;
}

/**
 * Concatenate multiple video clips into one
 */
export async function concatenateVideos(
  clipPaths: string[],
  outputPath: string,
  options: {
    transition?: string;
    transitionDuration?: number;
    resolution?: string;
    frameRate?: number;
  } = {}
): Promise<FFmpegResult> {
  const tempDir = path.dirname(outputPath);
  const listFile = path.join(tempDir, `concat_${Date.now()}.txt`);

  // Create concat list file
  const listContent = clipPaths.map(p => `file '${p}'`).join('\n');
  await fs.writeFile(listFile, listContent);

  try {
    const resolution = options.resolution || '1920x1080';
    const frameRate = options.frameRate || 24;

    const cmd = `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:v libx264 -preset medium -crf 23 -r ${frameRate} -s ${resolution} -c:a aac -b:a 128k -pix_fmt yuv420p "${outputPath}"`;
    await execAsync(cmd, { timeout: 600000 });

    const info = await getVideoInfo(outputPath);
    const stat = await fs.stat(outputPath);

    return {
      success: true,
      outputPath,
      duration: parseFloat((info.format as Record<string, unknown>).duration as string) || 0,
      fileSize: stat.size,
      videoCodec: 'h264',
      audioCodec: 'aac',
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
      resolution: '',
      error: String(error),
    };
  } finally {
    // Cleanup temp file
    try { await fs.unlink(listFile); } catch { /* ignore */ }
  }
}

/**
 * Mix audio tracks (narration + music + original)
 */
export async function mixAudio(
  inputs: Array<{ path: string; volume: number }>,
  outputPath: string
): Promise<string> {
  if (inputs.length === 0) throw new Error('No audio inputs provided');

  const filterParts = inputs.map((input, i) => `[${i}:a]volume=${input.volume}[a${i}]`);
  const mixParts = inputs.map((_, i) => `[a${i}]`);
  const filter = `${filterParts.join(';')};${mixParts.join('')}amix=inputs=${inputs.length}:duration=longest[out]`;

  const inputArgs = inputs.map(i => `-i "${i.path}"`).join(' ');
  const cmd = `ffmpeg -y ${inputArgs} -filter_complex "${filter}" -map "[out]" -c:a aac -b:a 128k "${outputPath}"`;

  await execAsync(cmd, { timeout: 300000 });
  return outputPath;
}

/**
 * Add captions to video
 */
export async function addCaptions(
  videoPath: string,
  srtPath: string,
  outputPath: string
): Promise<string> {
  const cmd = `ffmpeg -y -i "${videoPath}" -vf "subtitles=${srtPath}:force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'" -c:a copy "${outputPath}"`;
  await execAsync(cmd, { timeout: 300000 });
  return outputPath;
}

/**
 * Final render: concatenate clips, mix audio, add captions
 */
export async function renderFinalVideo(
  clipPaths: string[],
  outputPath: string,
  options: {
    narrationPath?: string;
    musicPath?: string;
    captionsPath?: string;
    resolution?: string;
    frameRate?: number;
    thumbnailPath?: string;
  } = {}
): Promise<FFmpegResult> {
  const tempDir = path.dirname(outputPath);

  try {
    // Step 1: Concatenate video clips
    const concatPath = path.join(tempDir, `concat_${Date.now()}.mp4`);
    const concatResult = await concatenateVideos(clipPaths, concatPath, {
      resolution: options.resolution,
      frameRate: options.frameRate,
    });

    if (!concatResult.success) {
      return concatResult;
    }

    let videoPath = concatPath;

    // Step 2: Mix audio if narration or music provided
    if (options.narrationPath || options.musicPath) {
      const audioInputs: Array<{ path: string; volume: number }> = [];
      audioInputs.push({ path: concatPath, volume: 0.3 }); // Original audio lower
      if (options.narrationPath) audioInputs.push({ path: options.narrationPath, volume: 1.0 });
      if (options.musicPath) audioInputs.push({ path: options.musicPath, volume: 0.15 });

      const mixedAudioPath = path.join(tempDir, `mixed_${Date.now()}.aac`);
      await mixAudio(audioInputs, mixedAudioPath);

      // Replace audio in video
      const withAudioPath = path.join(tempDir, `with_audio_${Date.now()}.mp4`);
      await execAsync(
        `ffmpeg -y -i "${concatPath}" -i "${mixedAudioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "${withAudioPath}"`,
        { timeout: 300000 }
      );

      videoPath = withAudioPath;
    }

    // Step 3: Add captions if provided
    if (options.captionsPath) {
      const captionedPath = path.join(tempDir, `captioned_${Date.now()}.mp4`);
      await addCaptions(videoPath, options.captionsPath, captionedPath);
      videoPath = captionedPath;
    }

    // Step 4: Copy to final output
    await fs.copyFile(videoPath, outputPath);

    // Step 5: Generate thumbnail
    if (options.thumbnailPath) {
      await generateThumbnail(outputPath, options.thumbnailPath);
    }

    // Get final info
    const info = await getVideoInfo(outputPath);
    const stat = await fs.stat(outputPath);

    // Cleanup temp files
    try {
      await fs.unlink(concatPath);
      if (options.narrationPath || options.musicPath) {
        const mixedPath = path.join(tempDir, `mixed_*.aac`);
        // Cleanup handled by glob in production
      }
    } catch { /* ignore cleanup errors */ }

    return {
      success: true,
      outputPath,
      duration: parseFloat((info.format as Record<string, unknown>).duration as string) || 0,
      fileSize: stat.size,
      videoCodec: 'h264',
      audioCodec: 'aac',
      resolution: options.resolution || '1920x1080',
    };
  } catch (error) {
    return {
      success: false,
      outputPath,
      duration: 0,
      fileSize: 0,
      videoCodec: '',
      audioCodec: '',
      resolution: '',
      error: String(error),
    };
  }
}
