// netlify/functions/gif.js
const { spawn }    = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

exports.handler = async (event) => {
  // 1) Read the ?video= query parameter
  const videoUrl = event.queryStringParameters?.video;
  if (!videoUrl) {
    return { statusCode: 400, body: 'Missing ?video= URL' };
  }

  // 2) Fetch the MP4 via the built-in fetch API
  let videoRes;
  try {
    videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(videoRes.statusText);
  } catch (e) {
    console.error('Fetch error:', e);
    return { statusCode: 502, body: 'Error fetching video' };
  }

  // 3) Spawn ffmpeg-static to convert MP4 → GIF
  const ffmpegPath = ffmpegStatic;
  const ff = spawn(ffmpegPath, [
    '-i', 'pipe:0',
    '-vf', 'fps=10,scale=600:-1:flags=lanczos',
    '-loop', '0',
    '-f', 'gif',
    'pipe:1'
  ]);

  // 4) Read the entire MP4 into a buffer, write to ffmpeg stdin
  const arrayBuffer = await videoRes.arrayBuffer();
  ff.stdin.write(Buffer.from(arrayBuffer));
  ff.stdin.end();

  // 5) Collect GIF output and stderr
  const chunks = [];
  let stderr = '';
  ff.stdout.on('data', c => chunks.push(c));
  ff.stderr.on('data', c => stderr += c);

  // 6) Wait for ffmpeg to finish
  const code = await new Promise(r => ff.on('close', r));
  if (code !== 0) {
    console.error('ffmpeg exited with code', code);
    console.error('ffmpeg stderr:', stderr);
    return {
      statusCode: 500,
      body: 'Conversion failed: ' + stderr.slice(0, 200)  // first 200 chars
    };
  }

  // 7) Return the GIF as Base64 (Lambda-compatible)
  const gifBuffer = Buffer.concat(chunks);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/gif' },
    body: gifBuffer.toString('base64'),
    isBase64Encoded: true
  };
};
