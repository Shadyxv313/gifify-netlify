// netlify/functions/gif.js

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Path to the vendored binary
const ffmpegPath = path.join(__dirname, 'bin', 'ffmpeg');

exports.handler = async (event) => {
  // 1) Decode the incoming URL
  const rawUrl = event.queryStringParameters?.video;
  if (!rawUrl) {
    return { statusCode: 400, body: 'Missing ?video= parameter.' };
  }
  let videoUrl;
  try {
    videoUrl = decodeURIComponent(rawUrl);
  } catch {
    return { statusCode: 400, body: 'Invalid encoded URL.' };
  }

  // 2) Fetch the video data
  let videoRes;
  try {
    videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(videoRes.statusText);
  } catch (err) {
    console.error('Fetch error:', err);
    return { statusCode: 502, body: 'Error fetching video: ' + err.message };
  }

  // 3) Write to /tmp/input.mp4
  const inputPath = '/tmp/input.mp4';
  const inputStream = fs.createWriteStream(inputPath);
  await new Promise((resolve, reject) => {
    const reader = videoRes.body.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          inputStream.write(Buffer.from(value));
        }
        inputStream.end();
      } catch (e) {
        reject(e);
      }
    })();
    inputStream.on('finish', resolve);
    inputStream.on('error', reject);
  });

  // 4) Spawn FFmpeg: read from file, output GIF to stdout
  const ff = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-i', inputPath,
    '-vf', 'fps=10,scale=600:-1:flags=lanczos',
    '-loop', '0',
    '-f', 'gif',
    'pipe:1'
  ]);

  // 5) Collect GIF output
  const chunks = [];
  let stderr = '';
  ff.stdout.on('data', c => chunks.push(c));
  ff.stderr.on('data', c => stderr += c);

  // 6) Wait for FFmpeg to finish
  const code = await new Promise(r => ff.on('close', r));
  if (code !== 0) {
    console.error('ffmpeg error:', stderr);
    return { statusCode: 500, body: 'Conversion failed: ' + stderr.slice(0,200) };
  }

  // 7) Return the GIF as Base64
  const gif = Buffer.concat(chunks);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/gif' },
    body: gif.toString('base64'),
    isBase64Encoded: true
  };
};
