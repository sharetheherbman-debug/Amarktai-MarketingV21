import os from 'os';
import path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import sharp from 'sharp';
import { composeEconomicalMarketingVideo } from '../services/ffmpeg.service';

describe('economical multi-scene Marketing video composer', () => {
  it('renders a bounded branded H.264/AAC/yuv420p MP4 from multiple approved stills', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'marketing-video-'));
    const hero = path.join(directory, 'hero.png');
    const benefit = path.join(directory, 'benefit.png');
    const endCard = path.join(directory, 'end-card.png');
    const output = path.join(directory, 'final.mp4');
    try {
      await Promise.all([
        sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#2456A6' } }).png().toFile(hero),
        sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#5AA469' } }).png().toFile(benefit),
        sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#0A1B3F' } }).png().toFile(endCard),
      ]);
      const result = await composeEconomicalMarketingVideo({
        stillPath: hero,
        stillPaths: [benefit],
        endCardPath: endCard,
        outputPath: output,
        durationSeconds: 8,
      });
      expect(result).toMatchObject({
        success: true,
        videoCodec: 'h264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        resolution: '1080x1920',
      });
      expect(result.duration).toBeGreaterThanOrEqual(7.2);
      expect(result.duration).toBeLessThanOrEqual(8.8);
      expect(result.fileSize).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
