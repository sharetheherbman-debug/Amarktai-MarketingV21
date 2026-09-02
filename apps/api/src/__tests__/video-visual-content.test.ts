import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { checkFFmpeg, inspectVideoVisualContent } from '../services/ffmpeg.service';

const run = promisify(execFile);

describe('rendered video visual-content gate', () => {
  test('rejects a uniform blank render and accepts visible picture content', async () => {
    if (!await checkFFmpeg()) return;
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marketing-video-content-'));
    const blank = path.join(directory, 'blank.mp4');
    const visible = path.join(directory, 'visible.mp4');
    try {
      await run('ffmpeg', ['-v','error','-y','-f','lavfi','-i','color=c=black:s=320x180:d=2','-pix_fmt','yuv420p',blank]);
      await run('ffmpeg', ['-v','error','-y','-f','lavfi','-i','testsrc=size=320x180:rate=24:duration=2','-pix_fmt','yuv420p',visible]);
      await expect(inspectVideoVisualContent(blank)).resolves.toMatchObject({ visible:false });
      const report = await inspectVideoVisualContent(visible);
      expect(report.visible).toBe(true);
      expect(report.lumaStandardDeviation).toBeGreaterThanOrEqual(2);
    } finally {
      await fs.rm(directory, { recursive:true, force:true });
    }
  }, 30000);
});
