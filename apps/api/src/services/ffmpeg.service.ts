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
  pixelFormat?: string;
  error?: string;
}

export interface FinalCompositionOptions {
  narrationPath?: string;
  soundtrackPath?: string;
  subtitlePath?: string;
  durationSeconds?: number;
  narrationVolume?: number;
  soundtrackVolume?: number;
  originalAudioVolume?: number;
  duckMusic?: boolean;
  captionFontSize?: number;
  captionColor?: string;
  captionPosition?: 'top' | 'middle' | 'bottom';
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

async function ffmpeg(args: string[], timeout = 900000): Promise<void> {
  await execFileAsync('ffmpeg', args, { timeout, maxBuffer: 16 * 1024 * 1024 });
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
): Promise<number> {
  const [width, height] = resolution.split('x').map(Number);
  if (!width || !height) throw new Error(`Invalid resolution: ${resolution}`);
  const info = await getVideoInfo(inputPath);
  const streams = (info.streams as Array<Record<string, unknown>>) || [];
  const hasAudio = streams.some((stream) => stream.codec_type === 'audio');
  const duration = Math.max(0.1, Number((info.format as Record<string, unknown>)?.duration || 0));
  const videoFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${frameRate},settb=AVTB`;

  const args = ['-y', '-i', inputPath];
  if (!hasAudio) {
    args.push('-f', 'lavfi', '-t', String(duration), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }
  args.push('-map', '0:v:0', '-map', hasAudio ? '0:a:0' : '1:a:0');
  args.push(
    '-vf', videoFilter,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '160k',
    '-shortest', '-movflags', '+faststart', outputPath
  );
  await ffmpeg(args);
  return duration;
}

function summarize(filePath: string, info: Record<string, unknown>, stat: { size: number }, resolution: string): FFmpegResult {
  const streams = (info.streams as Array<Record<string, unknown>>) || [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  return {
    success: true,
    outputPath: filePath,
    duration: Number((info.format as Record<string, unknown>)?.duration || 0),
    fileSize: stat.size,
    videoCodec: String(video?.codec_name || ''),
    audioCodec: String(audio?.codec_name || ''),
    pixelFormat: String(video?.pix_fmt || ''),
    resolution,
  };
}

const TRANSITIONS: Record<string, string> = {
  crossfade: 'fade',
  fade: 'fade',
  fadeblack: 'fadeblack',
  fadewhite: 'fadewhite',
  wipeleft: 'wipeleft',
  wiperight: 'wiperight',
  wipeup: 'wipeup',
  wipedown: 'wipedown',
  slideleft: 'slideleft',
  slideright: 'slideright',
  slideup: 'slideup',
  slidedown: 'slidedown',
  dissolve: 'dissolve',
  pixelize: 'pixelize',
  circleopen: 'circleopen',
  circleclose: 'circleclose',
};

async function transitionVideos(
  normalized: string[],
  durations: number[],
  transitions: string[],
  defaultDuration: number,
  outputPath: string
): Promise<void> {
  const args: string[] = ['-y'];
  normalized.forEach((item) => args.push('-i', item));
  const filters: string[] = [];
  let videoLabel = '[0:v]';
  let audioLabel = '[0:a]';
  let elapsed = durations[0];

  for (let index = 1; index < normalized.length; index += 1) {
    const requested = String(transitions[index] || 'cut').toLowerCase();
    const isCut = requested === 'cut' || requested === 'none';
    const duration = isCut
      ? 0.01
      : Math.max(0.05, Math.min(defaultDuration, durations[index - 1] / 3, durations[index] / 3));
    const transition = isCut ? 'fade' : (TRANSITIONS[requested] || 'fade');
    const offset = Math.max(0, elapsed - duration);
    const nextVideo = `[video${index}]`;
    const nextAudio = `[audio${index}]`;
    filters.push(
      `${videoLabel}[${index}:v]xfade=transition=${transition}:duration=${duration.toFixed(3)}:offset=${offset.toFixed(3)}${nextVideo}`
    );
    filters.push(
      `${audioLabel}[${index}:a]acrossfade=d=${duration.toFixed(3)}:c1=tri:c2=tri${nextAudio}`
    );
    videoLabel = nextVideo;
    audioLabel = nextAudio;
    elapsed += durations[index] - duration;
  }

  args.push('-filter_complex', filters.join(';'));
  args.push('-map', videoLabel, '-map', audioLabel);
  args.push(
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '160k',
    '-movflags', '+faststart', outputPath
  );
  await ffmpeg(args);
}

export async function concatenateVideos(
  clipPaths: string[],
  outputPath: string,
  options: {
    resolution?: string;
    frameRate?: number;
    transitions?: string[];
    transitionDuration?: number;
  } = {}
): Promise<FFmpegResult> {
  const tempDir = path.dirname(outputPath);
  const resolution = options.resolution || '1920x1080';
  const frameRate = options.frameRate || 24;
  const transitions = options.transitions || [];
  const normalized: string[] = [];
  const durations: number[] = [];
  const listPath = path.join(tempDir, `concat_${Date.now()}.txt`);

  try {
    if (clipPaths.length === 0) throw new Error('At least one video clip is required');
    for (let index = 0; index < clipPaths.length; index += 1) {
      const normalizedPath = path.join(tempDir, `normalized_${index}.mp4`);
      durations.push(await normalizeClip(clipPaths[index], normalizedPath, resolution, frameRate));
      normalized.push(normalizedPath);
    }

    const hasVisualTransition = transitions.slice(1).some((item) => !['', 'cut', 'none'].includes(String(item).toLowerCase()));
    if (normalized.length > 1 && hasVisualTransition) {
      await transitionVideos(
        normalized,
        durations,
        transitions,
        Math.max(0.1, Number(options.transitionDuration || 0.5)),
        outputPath
      );
    } else {
      await fs.writeFile(listPath, normalized.map((item) => `file '${item.replace(/'/g, "'\\''")}'`).join('\n'));
      await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', outputPath]);
    }

    const info = await getVideoInfo(outputPath);
    const stat = await fs.stat(outputPath);
    return summarize(outputPath, info, stat, resolution);
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

function escapeFilterPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,');
}

function assColor(hex = '#ffffff'): string {
  const clean = hex.replace('#', '').padEnd(6, 'f').slice(0, 6);
  const red = clean.slice(0, 2);
  const green = clean.slice(2, 4);
  const blue = clean.slice(4, 6);
  return `&H00${blue}${green}${red}`.toUpperCase();
}

export async function composeFinalVideo(
  inputPath: string,
  outputPath: string,
  options: FinalCompositionOptions = {}
): Promise<FFmpegResult> {
  const inputInfo = await getVideoInfo(inputPath);
  const streams = (inputInfo.streams as Array<Record<string, unknown>>) || [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const hasOriginalAudio = streams.some((stream) => stream.codec_type === 'audio');
  const resolution = videoStream
    ? `${Number(videoStream.width || 0)}x${Number(videoStream.height || 0)}`
    : 'unknown';
  const duration = options.durationSeconds || Number((inputInfo.format as Record<string, unknown>)?.duration || 0);

  const args: string[] = ['-y', '-i', inputPath];
  let nextInput = 1;
  let narrationIndex: number | null = null;
  let soundtrackIndex: number | null = null;
  let silentIndex: number | null = null;

  if (options.narrationPath) {
    narrationIndex = nextInput++;
    args.push('-i', options.narrationPath);
  }
  if (options.soundtrackPath) {
    soundtrackIndex = nextInput++;
    args.push('-stream_loop', '-1', '-i', options.soundtrackPath);
  }
  if (!hasOriginalAudio && narrationIndex === null && soundtrackIndex === null) {
    silentIndex = nextInput++;
    args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }

  const filters: string[] = [];
  let videoMap = '0:v:0';
  if (options.subtitlePath) {
    const alignment = options.captionPosition === 'top' ? 8 : options.captionPosition === 'middle' ? 5 : 2;
    const margin = options.captionPosition === 'bottom' || !options.captionPosition ? 48 : 24;
    filters.push(
      `[0:v]subtitles='${escapeFilterPath(options.subtitlePath)}':force_style='FontName=DejaVu Sans,FontSize=${Math.max(16, Number(options.captionFontSize || 42))},PrimaryColour=${assColor(options.captionColor)},OutlineColour=&HAA000000,BorderStyle=3,Outline=1,Shadow=0,Alignment=${alignment},MarginV=${margin}'[videoout]`
    );
    videoMap = '[videoout]';
  }

  const audioLabels: string[] = [];
  if (hasOriginalAudio) {
    filters.push(`[0:a]volume=${Math.max(0, Number(options.originalAudioVolume ?? 1))}[original]`);
    audioLabels.push('[original]');
  }

  let narrationMixLabel: string | null = null;
  let narrationSidechainLabel: string | null = null;
  if (narrationIndex !== null) {
    const volume = Math.max(0, Number(options.narrationVolume ?? 1));
    if (soundtrackIndex !== null && options.duckMusic !== false) {
      filters.push(`[${narrationIndex}:a]volume=${volume},aresample=48000,asplit=2[narrationmix][narrationside]`);
      narrationMixLabel = '[narrationmix]';
      narrationSidechainLabel = '[narrationside]';
    } else {
      filters.push(`[${narrationIndex}:a]volume=${volume},aresample=48000[narration]`);
      narrationMixLabel = '[narration]';
    }
  }

  if (soundtrackIndex !== null) {
    const musicVolume = Math.max(0, Number(options.soundtrackVolume ?? 0.25));
    const fadeIn = Math.max(0, Number(options.fadeInSeconds ?? 1));
    const fadeOut = Math.max(0, Number(options.fadeOutSeconds ?? 2));
    const fadeOutStart = Math.max(0, duration - fadeOut);
    filters.push(
      `[${soundtrackIndex}:a]volume=${musicVolume},aresample=48000,afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut}[music]`
    );
    if (narrationSidechainLabel) {
      filters.push(`[music]${narrationSidechainLabel}sidechaincompress=threshold=0.025:ratio=8:attack=20:release=500[duckedmusic]`);
      audioLabels.push('[duckedmusic]');
    } else {
      audioLabels.push('[music]');
    }
  }
  if (narrationMixLabel) audioLabels.push(narrationMixLabel);
  if (silentIndex !== null) {
    filters.push(`[${silentIndex}:a]atrim=duration=${Math.max(0.1, duration)},aresample=48000[silence]`);
    audioLabels.push('[silence]');
  }

  let audioMap: string;
  if (audioLabels.length === 1) {
    filters.push(`${audioLabels[0]}anull[audioout]`);
    audioMap = '[audioout]';
  } else {
    filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=2,alimiter=limit=0.95[audioout]`);
    audioMap = '[audioout]';
  }

  if (filters.length > 0) args.push('-filter_complex', filters.join(';'));
  args.push('-map', videoMap, '-map', audioMap);
  if (duration > 0) args.push('-t', String(duration));
  args.push(
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart', outputPath
  );

  try {
    await ffmpeg(args);
    const info = await getVideoInfo(outputPath);
    const stat = await fs.stat(outputPath);
    const result = summarize(outputPath, info, stat, resolution);
    if (result.videoCodec !== 'h264') throw new Error(`Expected H.264 output, received ${result.videoCodec || 'none'}`);
    if (result.audioCodec !== 'aac') throw new Error(`Expected AAC output, received ${result.audioCodec || 'none'}`);
    if (result.pixelFormat !== 'yuv420p') throw new Error(`Expected yuv420p output, received ${result.pixelFormat || 'none'}`);
    return result;
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
  }
}

export interface EconomicalMarketingVideoOptions {
  stillPath: string;
  endCardPath: string;
  outputPath: string;
  durationSeconds: number;
  subtitlePath?: string;
  captionColor?: string;
}

/**
 * Creates a bounded short-form marketing video from one governed still plus a
 * deterministic branded end-card. It deliberately uses no raw text-to-video
 * request: the only generated ingredient is the already-quoted still image.
 */
export async function composeEconomicalMarketingVideo(
  options: EconomicalMarketingVideoOptions
): Promise<FFmpegResult> {
  const duration = Math.max(5, Math.min(15, Math.floor(options.durationSeconds || 15)));
  const endCardDuration = Math.min(3, Math.max(2, Math.floor(duration / 3)));
  const sceneDuration = Math.max(3, duration - endCardDuration);
  const workPath = `${options.outputPath}.scene.mp4`;
  const sceneFrames = sceneDuration * 30;
  const videoFilter = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0006,1.12)':d=${sceneFrames}:s=1080x1920:fps=30,trim=duration=${sceneDuration},setpts=PTS-STARTPTS[scene]`,
    `[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih):color=black,trim=duration=${endCardDuration},setpts=PTS-STARTPTS[endcard]`,
    '[scene][endcard]concat=n=2:v=1:a=0[videoout]',
  ].join(';');
  try {
    await ffmpeg([
      '-y',
      '-loop', '1', '-t', String(sceneDuration), '-i', options.stillPath,
      '-loop', '1', '-t', String(endCardDuration), '-i', options.endCardPath,
      '-f', 'lavfi', '-t', String(duration), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-filter_complex', videoFilter,
      '-map', '[videoout]', '-map', '2:a:0',
      '-t', String(duration),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', workPath,
    ]);
    const finalResult = await composeFinalVideo(workPath, options.outputPath, {
      durationSeconds: duration,
      subtitlePath: options.subtitlePath,
      captionColor: options.captionColor || '#FFFFFF',
      captionPosition: 'bottom',
      captionFontSize: 42,
      originalAudioVolume: 0,
    });
    if (!finalResult.success) return finalResult;
    if (Math.abs(finalResult.duration - duration) > 0.8) {
      return { ...finalResult, success: false, error: `Expected a ${duration}-second promotional video, received ${finalResult.duration.toFixed(2)} seconds` };
    }
    return finalResult;
  } catch (error) {
    return {
      success: false,
      outputPath: options.outputPath,
      duration: 0,
      fileSize: 0,
      videoCodec: '',
      audioCodec: '',
      resolution: '1080x1920',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await fs.unlink(workPath).catch(() => undefined);
  }
}
